const { GoogleGenAI } = require("@google/genai");
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function run() {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-1.5-pro",
      contents: "say hi",
    });
    console.log(response.text);
  } catch(e) {
    console.error("Error:", e);
  }
}
run();
