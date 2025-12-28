# Declarative Self-Improving TypeScript

A DSPy mirror in TypeScript. Powered by [Vercel AI SDK](https://ai-sdk.dev).

Supported DSPy Primitives:

- [x] Signatures
- [x] LMs
- [x] Adapters
  - [x] JSONAdapter
  - [x] ChatAdapter
  - [ ] XMLAdapter
- [x] Modules
  - [x] Predict
  - [ ] ReAct
  - [ ] ChainOfThought
- [x] Tracing
- [x] Prediction
- [x] Tools - via [AI SDK Tools](https://ai-sdk.dev/docs/foundations/tools)
- [ ] Streaming

## Quickstart

```typescript
import { Signature, Module, Predict, configure } from "ds.ts";
import { openai } from "@ai-sdk/openai";

// 1. Setup the Language Model
configure({
  lm: openai("gpt-4o"),
});

// 2. Define a Module
class SimpleQA extends Module {
  private predictor = new Predict("question -> answer");

  async forward(input: { question: string }) {
    // 3. Return the result of the Predict
    return await this.predictor.run(input);
  }
}

// 5. Run the module
const qa = new SimpleQA();
const response = await qa.run({ question: "What is the capital of France?" });

console.log(response.answer); // "Paris"
```

## Signature

Signatures define the input and output schema for your predictors. You can define them using Zod schemas for full type safety and validation, or using an inline string.

### Object Definition

```typescript
const MySignature = new Signature({
  instructions: "Summarize the text.",
  input: z.object({
    text: z.string(),
  }),
  output: z.object({
    summary: z.string(),
  }),
});
```

### Inline Signatures

```typescript
const predict = Predict("question -> answer");
// or with instructions
const predict = Predict(
  Signature.parse("question -> answer", "Answer the question.")
);
```

## Tools

Tools are supported via [AI SDK Tools](https://ai-sdk.dev/docs/foundations/tools).

### Single Use

```typescript
import { z } from "zod";
import { Signature } from "ds.ts";

// 1. Declare the tool
const calculateStairsTool = {
  description: "Calculates the number of stairs needed for a given height",
  inputSchema: z.object({
    totalHeightInches: z.number().describe("The total vertical rise in inches"),
  }),
  execute: async ({ totalHeightInches }: { totalHeightInches: number }) => {
    const riserHeight = 7.5; // standard riser
    const numStairs = Math.ceil(totalHeightInches / riserHeight);
    return { numStairs, actualRiserHeight: totalHeightInches / numStairs };
  },
};

// 2. Pass it into a Signature
const StairSignature = new Signature({
  instructions: "Design a staircase based on the height.",
  input: z.object({
    height_inches: z.number(),
  }),
  output: z.object({
    building_plan: z.string(),
  }),
  tools: { calculateStairsTool },
});

// or inline
// const StairSignature = Signature.parse(
//   "height_inches -> building_plan",
//   "Design a staircase based on the height.",
//   { calculateStairsTool }
// );

// 3. Use it
const predict = new Predict(StairSignature);
const response = await predict.run({ height_inches: 100 });
console.log(response.building_plan);
```

You can also import tools.

```typescript
// First, you would run: bun add @exalabs/ai-sdk
import { searchTool } from "@exalabs/ai-sdk";
import { Signature } from "ds.ts";

// 1. Use the imported tool directly in your Signature
const ResearchSignature = new Signature({
  instructions: "Research the topic and provide a summary.",
  input: z.object({
    topic: z.string(),
  }),
  output: z.object({
    summary: z.string(),
  }),
  tools: {
    web_search: searchTool, // Use the imported tool here
  },
});
```

### ReAct

**Coming soon...**

## Introspection

Every `Prediction` returned by a built-in module includes the original AI SDK result (e.g., `GenerateTextResult` or `StreamTextResult`) in the `_result` property. This provides access to metadata like token usage, finish reasons, and raw tool calls. For example:

```typescript
const predict = new Predict("question -> answer");
const response = await predict.run({
  question: "What is the capital of France?",
});
console.log(response._result);
// {
//   "text": "The capital of France is Paris.",
//   "content": [
//     {
//       "type": "text",
//       "text": "The capital of France is Paris."
//     }
//   ],
//   "toolCalls": [],
//   "toolResults": [],
//   "finishReason": "stop",
//   "usage": {
//     "promptTokens": 15,
//     "completionTokens": 8,
//     "totalTokens": 23
//   },
//   "totalUsage": {
//     "promptTokens": 15,
//     "completionTokens": 8,
//     "totalTokens": 23
//   },
//   "steps": [
//     {
//       "text": "The capital of France is Paris.",
//       "content": [{ "type": "text", "text": "The capital of France is Paris." }],
//       "toolCalls": [],
//       "toolResults": [],
//       "finishReason": "stop",
//       "usage": { "promptTokens": 15, "completionTokens": 8, "totalTokens": 23 },
//       "response": {
//         "id": "chatcmpl-123",
//         "modelId": "gpt-4o",
//         "timestamp": "2025-12-27T10:00:00Z",
//         "headers": { "x-ratelimit-remaining": "100" }
//       }
//     }
//   ],
//   "response": {
//     "id": "chatcmpl-123",
//     "modelId": "gpt-4o",
//     "timestamp": "2025-12-27T10:00:00Z",
//     "headers": { "x-ratelimit-remaining": "100" }
//   },
//   "warnings": []
// }
```

This project was created using `bun init` in bun v1.3.5. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
