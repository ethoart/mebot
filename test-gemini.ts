import { GoogleGenAI } from "@google/genai";
async function run() {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    try {
        const response1 = await ai.models.generateContent({
             model: "gemini-3.5-flash",
             contents: [{ text: "Hello" }]
        });
        console.log("gemini-3.5-flash works", response1.text);
    } catch(e: any) {
        console.log("gemini-3.5-flash failed", e.message);
    }
}
run();
