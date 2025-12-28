import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { ChatAdapter } from "../../src/adapters/chat_adapter";
import { Signature } from "../../src/signatures/signature";
import { MockLM } from "../test_utils";
import {
  Image,
  Audio,
  File,
  CUSTOM_TYPE_START_IDENTIFIER,
  CUSTOM_TYPE_END_IDENTIFIER,
} from "../../src/adapters/types";

describe("ChatAdapter", () => {
  const adapter = new ChatAdapter();

  describe("format", () => {
    test("basic formatting", () => {
      const signature = Signature.parse(
        "question: string -> answer: string",
        "Answer the question."
      );
      const messages = adapter.format(signature, [], {
        question: "What is 2+2?",
      });

      expect(messages).toHaveLength(2);
      expect(messages[0]!.role).toBe("system");
      expect(messages[0]!.content).toContain("Answer the question.");
      expect(messages[0]!.content).toContain("Your input fields are:");
      expect(messages[0]!.content).toContain("1. `question` (string)");
      expect(messages[0]!.content).toContain("Your output fields are:");
      expect(messages[0]!.content).toContain("1. `answer` (string)");

      expect(messages[1]!.role).toBe("user");
      expect(messages[1]!.content).toContain("[[ ## question ## ]]");
      expect(messages[1]!.content).toContain('"What is 2+2?"');
      expect(messages[1]!.content).toContain(
        "Respond with the corresponding output fields, starting with the field `[[ ## answer ## ]]`"
      );
    });

    test("formatting with few-shot demos", () => {
      const signature = Signature.parse("question -> answer");
      const demos = [{ question: "What is 1+1?", answer: "2" }];
      const messages = adapter.format(signature, demos, {
        question: "What is 2+2?",
      });

      // 1 system message, 2 messages for the demo (user + assistant), 1 user message
      expect(messages).toHaveLength(4);

      // Demo messages
      expect(messages[1]!.role).toBe("user");
      expect(messages[1]!.content).toContain('"What is 1+1?"');
      expect(messages[2]!.role).toBe("assistant");
      expect(messages[2]!.content).toContain("[[ ## answer ## ]]");
      expect(messages[2]!.content).toContain('"2"');
      expect(messages[2]!.content).toContain("[[ ## completed ## ]]");

      // Current input message
      expect(messages[3]!.role).toBe("user");
      expect(messages[3]!.content).toContain('"What is 2+2?"');
    });

    test("formatting with incomplete demos", () => {
      const signature = Signature.parse("q1, q2 -> a1, a2");
      const demos = [{ q1: "test1", a1: "ans1" }]; // incomplete demo
      const messages = adapter.format(signature, demos, {
        q1: "q1val",
        q2: "q2val",
      });

      // 1 system + 2 demo + 1 user = 4
      expect(messages).toHaveLength(4);
      expect(messages[1]!.content).toContain(
        "This is an example of the task, though some input or output fields are not supplied."
      );
      expect(messages[2]!.content).toContain(
        "Not supplied for this particular example. "
      );
    });
  });

  describe("parse", () => {
    test("basic parsing", () => {
      const signature = Signature.parse("question -> answer");
      const completion = "[[ ## answer ## ]]\nParis\n\n[[ ## completed ## ]]";
      const result = adapter.parse(signature, completion);
      expect(result).toEqual({ answer: "Paris" });
    });

    test("multi-line parsing", () => {
      const signature = Signature.parse("question -> answer");
      const completion =
        "[[ ## answer ## ]]\nThis is\na multi-line\nanswer\n\n[[ ## completed ## ]]";
      const result = adapter.parse(signature, completion);
      expect(result).toEqual({ answer: "This is\na multi-line\nanswer" });
    });

    test("multiple fields parsing", () => {
      const signature = Signature.parse("q -> a1, a2");
      const completion =
        "[[ ## a1 ## ]]\nans1\n\n[[ ## a2 ## ]]\nans2\n\n[[ ## completed ## ]]";
      const result = adapter.parse(signature, completion);
      expect(result).toEqual({ a1: "ans1", a2: "ans2" });
    });

    test("parsing error on missing fields", () => {
      const signature = Signature.parse("q -> a1, a2");
      const completion = "[[ ## a1 ## ]]\nans1\n\n[[ ## completed ## ]]";
      expect(() => adapter.parse(signature, completion)).toThrow();
    });

    test("partial parsing with allow_partial_output", () => {
      const signature = Signature.parse("q -> a1, a2");
      const completion = "[[ ## a1 ## ]]\nans1\n\n[[ ## completed ## ]]";
      const result = adapter.parse(signature, completion, true);
      expect(result).toEqual({ a1: "ans1" });
    });
  });

  describe("special types", () => {
    test("Image, Audio, File formatting", () => {
      const signature = new Signature({
        input: z.object({
          img: Image(),
          aud: Audio(),
          doc: File(),
        }),
        output: z.object({ answer: z.string() }),
      });

      const inputs = {
        img: "image-data",
        aud: "audio-data",
        doc: "file-data",
      };

      const messages = adapter.format(signature, [], inputs);

      expect(messages).toHaveLength(2);
      expect(messages[1]!.role).toBe("user");

      const content = messages[1]!.content;
      // After split_message_content_for_custom_types, message.content should be an array of blocks
      expect(Array.isArray(content)).toBe(true);

      const contentArray = content as unknown as any[];

      const imageBlock = contentArray.find((c) => c.type === "image");
      expect(imageBlock).toBeDefined();
      expect(imageBlock.image).toBe("image-data");

      const audioBlock = contentArray.find(
        (c) => c.type === "file" && c.mediaType === "audio/mpeg"
      );
      expect(audioBlock).toBeDefined();
      expect(audioBlock.data).toBe("audio-data");

      const fileBlock = contentArray.find(
        (c) => c.type === "file" && c.mediaType === "application/octet-stream"
      );
      expect(fileBlock).toBeDefined();
      expect(fileBlock.data).toBe("file-data");
    });
  });

  describe("lifecycle and fallback", () => {
    test("successful lifecycle", async () => {
      const lm = new MockLM();
      const signature = Signature.parse("question -> answer");

      // Mock LM to return a valid ChatAdapter response
      lm.generateText = async (options: any) => {
        return {
          text: "[[ ## answer ## ]]\nParis\n\n[[ ## completed ## ]]",
          responseMessages: [],
          finishReason: "stop",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          rawResponse: { headers: {} },
          request: {},
          warnings: [],
        } as any;
      };

      const result = await adapter.run(lm, {}, signature, [], {
        question: "What is the capital of France?",
      });
      expect(result.output).toEqual({ answer: "Paris" });
    });

    test("fallback to JSONAdapter on parse error", async () => {
      const lm = new MockLM();
      const signature = Signature.parse("question -> answer");

      // First call fails ChatAdapter.parse (returns plain text)
      // Second call (from JSONAdapter) will use structured output
      let callCount = 0;
      lm.generateText = async (options: any) => {
        callCount++;
        if (options.output) {
          // This is the JSONAdapter call
          return {
            output: { answer: "Paris (via JSON)" },
            text: '{"answer": "Paris (via JSON)"}',
            finishReason: "stop",
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          } as any;
        }
        // This is the ChatAdapter call
        return {
          text: "Invalid response format",
          finishReason: "stop",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        } as any;
      };

      const result = await adapter.run(lm, {}, signature, [], {
        question: "What is the capital of France?",
      });

      expect(callCount).toBe(2);
      // JSONAdapter.run returns the result directly, and for structured output,
      // the result is often expected to have the data in .output.
      // In JSONAdapter.ts, it returns the result of lm.generateText directly.
      // So result.output should be what we want.
      expect((result as any).output).toEqual({ answer: "Paris (via JSON)" });
    });
  });
});
