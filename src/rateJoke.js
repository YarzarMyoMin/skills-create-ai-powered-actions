const OpenAI = require("openai");
const { GoogleGenAI } = require("@google/genai");

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

const SYSTEM_PROMPT =
  "You are a helpful assistant that evaluates jokes. " +
  "Assess whether the input is actually a joke, and if so, " +
  "rate its humor quality, creativity, and delivery. " +
  "Respond briefly and include a numeric overall rating from 0–10.";

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

  const response = await client.chat.completions.create({
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
  });

  const content = response?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(
      `Invalid response from ${provider}: ${JSON.stringify(response)}`,
    );
  }

  return content;
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
  });

  return response.text;
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
