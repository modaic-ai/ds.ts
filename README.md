# Declarative Self-Improving TypeScript

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.5. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## DSPy Concepts in DS.ts

| DSPy Concept | ds.ts Equivalent                                                                          |
| ------------ | ----------------------------------------------------------------------------------------- |
| Signature    | `Signature` class                                                                         |
| LM           | [AI SDK's providers and models](https://ai-sdk.dev/docs/foundations/providers-and-models) |
| Adapter      | Adapter class                                                                             |
| Module       | Module class                                                                              |
| Prediction   | Zod object (output of the signature)                                                      |

## Signature

Signatures define the input and output schema for your predictors. You can define them using Zod schemas for full type safety and validation, or using a shorthand string.

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

### String Shorthand

```typescript
const MySignature = Signature.parse("text -> summary", "Summarize the text.");
```

### Chaining & Transformation

You can easily modify signatures:

```typescript
const modifiedSig =
  MySignature.delete("text").withInstructions("New instructions");
```

## Modules

### Predict

### ReAct

### ChainOfThought

Coming soon...
