import { interpretWithGemini } from "./gemini-interpreter.js";

export async function interpretRequirement(text) {
  // Use Gemini API for intelligent interpretation
  return await interpretWithGemini(text);
}