const OpenAI = require("openai");
const { GoogleGenAI } = require("@google/genai");
const { zodResponseFormat } = require("openai/helpers/zod");
const { z } = require("zod");

// Define the structured output format using Zod schema
const JokeRatingSchema = z.object({
  is_joke: z
    .boolean()
    .describe("Whether the input is actually a joke or attempt at humor"),
  score: z
    .number()
    .min(1)
    .max(10)
    .nullable()
    .describe("Rating from 1-10, where 10 is the funniest."),
  humor_type: z
    .string()
    .nullable()
    .describe("The type of humor (e.g., pun, wordplay, dad joke, dark, etc)"),
  feedback: z
    .string()
    .nullable()
    .describe("Short feedback on the joke's strengths and weaknesses."),
});

const PROVIDERS = {
  openrouter: {
    apiKey: () => process.env.OPENROUTER_API_KEY,
    model: () => process.env.OPENROUTER_MODEL,
    baseURL: "https://openrouter.ai/api/v1",
  },
  groq: {
    apiKey: () => process.env.GROQ_API_KEY,
    model: () => process.env.GROQ_MODEL,
    baseURL: "https://api.groq.com/openai/v1",
  },
  gemini: {
    apiKey: () => process.env.GEMINI_API_KEY,
    model: () => process.env.GEMINI_MODEL,
  },
};

// const SYSTEM_PROMPT =
//   "You are a helpful assistant that evaluates jokes. " +
//   "Assess whether the input is actually a joke, and if so, " +
//   "rate its humor quality, creativity, and delivery.";
// "Respond briefly and include a numeric overall rating from 0–10.";

const SYSTEM_PROMPT = `
You evaluate jokes.
Return ONLY a JSON object matching the provided schema.
Do not use Markdown.
Do not use code fences.
Do not add explanations outside the JSON.
The JSON must contain:
- is_joke: boolean
- score: number from 1 to 10, or null if it is not a joke
- humor_type: string or null
- feedback: short string or null
`;

async function rateOpenAICompatible(joke, provider, config) {
  const apiKey = config.apiKey();
  const model = config.model();

  if (!apiKey) {
    throw new Error(`Missing ${provider.toUpperCase()}_API_KEY`);
  }

  if (!model) {
    throw new Error(`Missing ${provider.toUpperCase()}_MODEL`);
  }

  const client = new OpenAI({
    apiKey,
    ...(config.baseURL && {
      baseURL: config.baseURL,
    }),
  });

  const response = await client.chat.completions.parse({
    model,
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `Please rate this joke: "${joke}"`,
      },
    ],
    // Use Zod schema for structured response
    response_format: zodResponseFormat(JokeRatingSchema, "joke_rating"),
  });

  // Return the parsed response (automatically validated by Zod)
  // const content = response?.choices?.[0]?.message?.parsed;

  // if (!content) {
  //   throw new Error(
  //     `Invalid response from ${provider}: ${JSON.stringify(response)}`,
  //   );
  // }

  // return content;
  const message = response?.choices?.[0]?.message;

  if (!message) {
    throw new Error(
      `Invalid response from ${provider}: ${JSON.stringify(response)}`,
    );
  }

  if (message.refusal) {
    throw new Error(`${provider} refused the request: ${message.refusal}`);
  }

  if (message.parsed) {
    return message.parsed;
  }

  throw new Error(
    `Provider ${provider} did not return structured JSON. ` +
      `Response: ${message.content}`,
  );
}

async function rateGemini(joke, config) {
  const apiKey = config.apiKey();
  const modelName = config.model();

  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  if (!modelName) {
    throw new Error("Missing GEMINI_MODEL");
  }

  const ai = new GoogleGenAI({ apiKey: apiKey });
  const response = await ai.models.generateContent({
    model: modelName,
    contents: `${SYSTEM_PROMPT} Please rate this joke: "${joke}"`,
    // config: {
    //   responseFormat: {
    //     text: {
    //       mimeType: "application/json",
    //       schema: z.toJSONSchema(JokeRatingSchema),
    //     },
    //   },
    // },
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(JokeRatingSchema),
    },
  });
  // const content = JokeRatingSchema.safeParse(JSON.parse(response.text));
  // console.log(content.data);
  // return content.data;

  if (!response?.text) {
    throw new Error(
      `Invalid response from Gemini: ${JSON.stringify(response)}`,
    );
  }

  let parsed;

  try {
    parsed = JSON.parse(response.text);
  } catch (error) {
    throw new Error(`Gemini returned invalid JSON: ${response.text}`);
  }

  const result = JokeRatingSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(
      `Gemini response failed Zod validation: ${result.error.message}`,
    );
  }

  return result.data;
}

async function rateJoke(joke, provider) {
  const selectedProvider = provider.toLowerCase().trim();

  const config = PROVIDERS[selectedProvider];

  if (!config) {
    throw new Error(
      `Unsupported provider: ${provider}. ` +
        "Supported providers: openrouter, gemini, groq",
    );
  }

  if (selectedProvider === "gemini") {
    return rateGemini(joke, config);
  }

  return rateOpenAICompatible(joke, selectedProvider, config);
}

module.exports = { rateJoke };
