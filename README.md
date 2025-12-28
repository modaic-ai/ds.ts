<p align="center">
  <img src="https://raw.githubusercontent.com/modaic-ai/ds.ts/refs/heads/main/assets/DSTs-logo2.png" alt="DS.TS Logo" width="500">
</p>

<h1 align="center">DSTs: Declarative Self-Improving TypeScript</h1>

<p align="center">
  <em>A DSPy mirror in TypeScript. Powered by Vercel AI SDK.</em>
</p>

[![npm version](https://img.shields.io/npm/v/@modaic/dsts.svg)](https://www.npmjs.com/package/@modaic/dsts)

## Overview

DSTs implements the DSPy API as a layer over Vercel's [AI SDK](https://ai-sdk.dev), enabling you to use DSPy primitives and optimizers with the AI SDK's extensive infrastructure. Note: some DSPy primitives are still under active development.

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
- [ ] Optimizers

## Installation

**NPM**

```bash
npm install @modaic/dsts
```

**Bun**

```bash
bun add @modaic/dsts
```

## Quickstart

```typescript
import { Signature, Module, Predict, configure, LM } from "ds.ts";
import { openai } from "@ai-sdk/openai";

// 1. Setup the Language Model
configure({
  lm: new LM(openai("gpt-4o")),
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
    text: z.string().describe("The text to summarize"),
  }),
  output: z.object({
    summary: z
      .string()
      .describe("The summary of the text (less than 200 words)"),
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

### Images

Support for images is provided via the [AI SDK Images](https://ai-sdk.dev/docs/foundations/prompts#image-parts) interface.

```typescript
import { Image } from "@ai-sdk/openai";
const SigWithImage = new Signature({
  instructions: "Describe the image.",
  input: z.object({
    image: Image(),
  }),
  output: z.object({
    description: z.string().describe("The description of the image"),
  }),
});

const predict = new Predict(SigWithImage);
/// Pass in image as any supported data type from the AI SDK
// Base64
const response = await predict.run({ image: "data:image/png;base64,..." });
// Binary
const response = await predict.run({ image: fs.readFileSync("image.png") });
// URL
const response = await predict.run({ image: "https://example.com/image.png" });
```

### Files

Support for files is provided via the [AI SDK Files](https://ai-sdk.dev/docs/foundations/prompts#file-parts) interface.

```typescript
// See: https://ai-sdk.dev/docs/foundations/prompts#file-parts
// Example Signature accepting a file (user must provide 'mediaType')

const SigWithFile = new Signature({
  instructions: "Describe the uploaded file. You will receive it as a buffer.",
  input: z.object({
    file: File(),
  }),
  output: z.object({
    description: z.string().describe("A description of the provided file."),
  }),
});

// Example usage (PDF from Buffer, see ai-sdk docs for more!):
import { Predict } from "ds.ts";
import fs from "fs";
const predict = new Predict(SigWithFile);

const response = await predict.run({
  file: {
    mediaType: "application/pdf",
    data: fs.readFileSync("./data/example.pdf"),
  },
});
console.log(response.description);

// More options (audio, image, URL):

// File by URL:
const imageResponse = await predict.run({
  file: {
    mediaType: "application/pdf",
    data: "https://example.com/example.pdf",
  },
});
```

### Audio

```typescript
const SigWithAudio = new Signature({
  instructions: "Describe the audio.",
  input: z.object({
    audio: Audio(),
  }),
  output: z.object({
    description: z.string().describe("The description of the audio"),
  }),
});
const audioResponse = await predict.run({
  file: {
    data: fs.readFileSync("./data/galileo.mp3"),
  },
});
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
    height_inches: z.number().describe("The total vertical rise in inches"),
  }),
  output: z.object({
    building_plan: z.string().describe("The building plan for the staircase"),
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
