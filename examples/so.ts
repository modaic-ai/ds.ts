import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const { output } = await generateText({
  model: openai("gpt-4.1-mini"),
  output: Output.object({
    schema: z.object({
      recipe: z.object({
        name: z.string(),
        ingredients: z.array(
          z.object({ name: z.string(), amount: z.string() })
        ),
        steps: z.array(z.string()),
      }),
    }),
  }),
  prompt: "Generate a lasagna recipe.",
});

console.log(output);
