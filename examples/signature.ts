import { z } from "zod";
import {
  defineSignature,
  type Signature,
  Input,
  Output,
  type InferSignatureInput,
  type InferSignatureOutput,
} from "../index";

/**
 * 1. Object-based definition with new Input/Output helpers
 */
export const MySignature = defineSignature({
  instructions: "Extract the user account",
  input: Input.object({
    schema: z.object({
      input: z.string(),
    }),
    description: "Raw user data string",
  }),
  output: Output.object({
    schema: z.object({
      id: z.string().uuid(),
      name: z.string(),
      email: z.string().email(),
    }),
    description: "Structured user profile",
  }),
});

type MyInput = InferSignatureInput<typeof MySignature>;
type MyOutput = InferSignatureOutput<typeof MySignature>;

/**
 * 2. Mixed definition (Zod + Input/Output)
 */
export const MixedSignature = defineSignature({
  input: z.object({ query: z.string() }),
  output: Output.array({
    element: z.object({
      tag: z.string(),
      confidence: z.number(),
    }),
  }),
});

/**
 * 3. Choice-based Input
 */
export const ChoiceSignature = defineSignature({
  input: Input.choice({
    options: ["easy", "medium", "hard"],
    description: "Difficulty level",
  }),
  output: z.object({
    score: z.number(),
  }),
});

/**
 * 4. String-based definition (inline signature)
 */
export const InlineSignature = defineSignature(
  "question: string, context: string -> answer: string",
  "Answer the question based on the context."
);

class MyClass<S extends Signature<any, any>> {
  constructor(public signature: S) {}

  async run(input: InferSignatureInput<S>): Promise<InferSignatureOutput<S>> {
    console.log(`\n--- Running Signature ---`);
    if (this.signature.instructions) {
      console.log(`Instructions: "${this.signature.instructions}"`);
    }
    console.log("Input provided:", input);

    // Mocking response logic
    const mockResult: any = {};
    let outputSchema: any = this.signature.output;

    // Handle different output spec types for mocking
    if (
      outputSchema &&
      typeof outputSchema.parseCompleteOutput === "function"
    ) {
      // It's an AI SDK Output spec, we can't easily peek inside its schema without internal knowledge
      // but we know for this playground what to return
      mockResult.id = "550e8400-e29b-41d4-a716-446655440000";
      mockResult.name = "John Doe";
      mockResult.email = "john@example.com";
      return mockResult;
    }

    const outputShape = (outputSchema as any).shape || {};

    for (const key of Object.keys(outputShape)) {
      mockResult[key] = `mock_${key}_value`;
    }

    return mockResult;
  }
}

// Testing Object-based with helpers
const runner1 = new MyClass(MySignature);
const result1 = await runner1.run({ input: "User data string" });
console.log("Result 1 (Helpers):", result1);

// Testing Mixed
const runner2 = new MyClass(MixedSignature);
const result2 = await runner2.run({ query: "find tags" });
console.log("Result 2 (Mixed):", result2);

// Testing Choice
const runner3 = new MyClass(ChoiceSignature);
const result3 = await runner3.run("medium");
console.log("Result 3 (Choice):", result3);
