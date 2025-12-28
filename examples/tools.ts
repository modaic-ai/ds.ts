import { z } from "zod";
import { generateText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";

const myTool = {
  description: "Returns stuff about Vercel",
  inputSchema: z.object({
    query: z.string(),
  }),
  execute: async ({ query }: { query: string }) => {
    // your tool logic
    // throw new Error("Not implemented");
    return {
      result: `Vercel Ship AI was released on ${new Date().toISOString()}`,
    };
  },
};

const result = await generateText({
  model: openai("gpt-4.1-mini"),
  prompt: "When was Vercel Ship AI?",
  tools: {
    webSearch: myTool,
  },
  stopWhen: stepCountIs(10),
});
// console.log("TOOL RESULTS");
// console.log(result.toolResults);
// console.log("TOOL CALLS");
// console.log(result.toolCalls);
// console.log("STEPS");
// console.log(result.steps);

for (const step of result.steps) {
  for (const part of step.content) {
    if (part.type === "tool-call") {
      console.log("TOOL CALL");
      console.log(part);
    } else if (part.type === "tool-result") {
      console.log("TOOL RESULT");
      console.log(part);
    } else if (part.type === "tool-error") {
      console.log("TOOL ERROR");
      //   console.log(part);
      console.log(part);
    }
  }
}
