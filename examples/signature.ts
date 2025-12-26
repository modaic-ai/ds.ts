import { z } from "zod";
import {
  Signature,
  type InferSignatureInput,
  type InferSignatureOutput,
} from "../index";

/**
 * 1. Object-based definition with Zod schemas
 */
export const MySignature = new Signature({
  instructions: "Extract the user account",
  input: z.object({
    input: z.string().describe("Raw user data string"),
  }),
  output: z.object({
    id: z.string().uuid(),
    name: z.string(),
    email: z.string().email(),
  }),
});

type MyInput = typeof MySignature.InferInput;
type MyOutput = typeof MySignature.InferOutput;

// You can still use the older helper types as well:
// type MyInput = InferSignatureInput<typeof MySignature>;
// type MyOutput = InferSignatureOutput<typeof MySignature>;

/**
 * 2. Another example with Zod schemas
 */
export const MixedSignature = new Signature({
  input: z.object({ query: z.string() }),
  output: z.object({
    tags: z.array(
      z.object({
        tag: z.string(),
        confidence: z.number(),
      })
    ),
  }),
});

/**
 * 3. Choice-based Input using Zod enum
 */
export const ChoiceSignature = new Signature({
  input: z.object({
    level: z.enum(["easy", "medium", "hard"]).describe("Difficulty level"),
  }),
  output: z.object({
    score: z.number(),
  }),
});

/**
 * 4. String-based definition (inline signature)
 * These still return Zod objects for input/output.
 */
export const InlineSignature = Signature.parse(
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
    const outputSchema = this.signature.output;

    const outputShape = outputSchema.shape || {};
    for (const key of Object.keys(outputShape)) {
      mockResult[key] = `mock_${key}_value`;
    }

    // Specific overrides for MySignature to match uuid/email
    if (outputSchema === MySignature.output) {
      mockResult.id = "550e8400-e29b-41d4-a716-446655440000";
      mockResult.name = "John Doe";
      mockResult.email = "john@example.com";
    }

    if (outputSchema === MixedSignature.output) {
      mockResult.tags = [{ tag: "mock_tag", confidence: 0.9 }];
    }

    return mockResult;
  }
}

// Testing Object-based with Zod
const runner1 = new MyClass(MySignature);
const result1 = await runner1.run({ input: "User data string" });
console.log("Result 1 (Zod):", result1);

// Testing Array output
const runner2 = new MyClass(MixedSignature);
const result2 = await runner2.run({ query: "find tags" });
console.log("Result 2 (Array):", result2);

// Testing Choice
const runner3 = new MyClass(ChoiceSignature);
const result3 = await runner3.run({ level: "medium" });
console.log("Result 3 (Enum):", result3);
