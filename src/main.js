const { rateJoke } = require("./rateJoke");
const core = require("@actions/core");

async function run() {
  try {
    const joke = core.getInput("joke", {
      required: true,
    });

    const provider = process.env.PROVIDER_NAME;

    if (!provider) {
      throw new Error("PROVIDER_NAME environment variable is required");
    }

    const rating = await rateJoke(joke, provider);

    core.setOutput("result", rating);
    core.setOutput("provider", provider.toUpperCase());
  } catch (error) {
    core.setFailed(error.message);
  }
}

module.exports = { run };
