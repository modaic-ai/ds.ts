import { expect, test, describe } from "bun:test";
import { LM } from "../../src/clients/lm";
import { openai } from "@ai-sdk/openai";

describe("LM", () => {
  const model = openai("gpt-4o-mini");
  const lm = new LM(model);

  test("should be instantiated correctly", () => {
    expect(lm.model).toBeDefined();
    expect(lm.providerOptions).toBeUndefined();
  });

  test("copy should work", () => {
    const lmCopy = lm.copy({
      providerOptions: { openai: { user: "test-user" } } as any,
    });
    expect(lmCopy.model).toBe(lm.model);
    expect(lmCopy.providerOptions).toEqual({
      openai: { user: "test-user" },
    } as any);
  });

  test("generateText should work", async () => {
    if (!process.env.OPENAI_API_KEY) {
      console.warn(
        "Skipping generateText test: OPENAI_API_KEY not found in environment"
      );
      return;
    }

    const response = await lm.generateText({
      prompt: "Say 'Hello'",
    });

    expect(response.text.toLowerCase()).toContain("hello");
  });

  test("streamText should work", async () => {
    if (!process.env.OPENAI_API_KEY) {
      console.warn(
        "Skipping streamText test: OPENAI_API_KEY not found in environment"
      );
      return;
    }

    const { textStream } = await lm.streamText({
      prompt: "Say 'Hello'",
    });

    let fullText = "";
    for await (const delta of textStream) {
      fullText += delta;
    }

    expect(fullText.toLowerCase()).toContain("hello");
  });
});
