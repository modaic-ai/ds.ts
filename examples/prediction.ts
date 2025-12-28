import { z } from "zod";
import { Signature, Prediction, type InferOutput } from "../src/index";
import type { GenerateTextResult } from "ai";

/**
 * 1. Define a Signature
 */
const SentimentSignature = new Signature({
  instructions: "Classify the sentiment of the text.",
  input: z.object({
    text: z.string().describe("The text to analyze"),
  }),
  output: z.object({
    sentiment: z.enum(["positive", "negative", "neutral"]),
    confidence: z.number().min(0).max(1),
    reasoning: z
      .string()
      .describe("Explanation for the sentiment classification"),
  }),
});

/**
 * 2. Define a function that returns a Prediction
 * In a real scenario, this would be a Predictor module that calls an LM.
 */
async function mockPredict(
  text: string
): Promise<Prediction<InferOutput<typeof SentimentSignature>>> {
  // Mock output that matches the signature's output schema
  const predictionResult = {
    sentiment: "positive" as const,
    confidence: 0.95,
    reasoning: "The user expressed extreme satisfaction with the new feature.",
  };

  // Mock LM result (GenerateTextResult from 'ai' package)
  const mockResult: any = {
    text: JSON.stringify(predictionResult),
    sources: [],
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    finishReason: "stop",
    warnings: [],
    request: {} as any,
    response: {} as any,
    steps: [],
  };

  // Constructing the Prediction object
  // It unpacks the output fields and adds metadata
  return new Prediction(predictionResult, mockResult);
}

/**
 * 3. Usage example
 */
async function main() {
  const text =
    "I love this library! It makes DSPy patterns so easy to use in TypeScript.";
  const prediction = await mockPredict(text);

  // You can access fields directly from the prediction object
  console.log("Sentiment:", prediction.sentiment); // "positive"
  console.log("Confidence:", prediction.confidence); // 0.95
  console.log("Reasoning:", prediction.reasoning);

  // You can also access the original LM result metadata
  if (prediction._result) {
    const usage = (prediction._result as any).usage;
    console.log(
      "Tokens used:",
      usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0)
    );
  }

  // The output fields are unpacked onto the prediction object
  console.log("Prediction keys:", Object.keys(prediction));
}

main().catch(console.error);
