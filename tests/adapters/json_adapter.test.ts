import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { JSONAdapter } from "../../src/adapters/json_adapter";
import { Signature } from "../../src/signatures/signature";
import { MockLM } from "../test_utils";

describe("JSONAdapter", () => {
  const adapter = new JSONAdapter();

  describe("format", () => {
    test("basic formatting", () => {
      const signature = Signature.parse("question -> answer");
      const messages = adapter.format(signature, [], {
        question: "What is 2+2?",
      });

      expect(messages[0]!.content).toContain(
        "Outputs will be a JSON object with the following fields."
      );
      expect(messages[1]!.content).toContain("[[ ## question ## ]]");
      expect(messages[1]!.content).toContain('"What is 2+2?"');
      expect(messages[1]!.content).toContain(
        "Respond with a JSON object in the following order of fields: `answer`."
      );
    });

    test("formatting with demos (assistant messages as JSON)", () => {
      const signature = Signature.parse("question -> answer");
      const demos = [{ question: "1+1", answer: "2" }];
      const messages = adapter.format(signature, demos, { question: "2+2" });

      expect(messages).toHaveLength(4);
      expect(messages[2]!.role).toBe("assistant");

      // JSONAdapter formats assistant messages as JSON
      const content = JSON.parse(messages[2]!.content);
      expect(content).toEqual({ answer: "2" });
    });
  });

  describe("parse", () => {
    test("parsing JSON completion", () => {
      const signature = Signature.parse("question -> answer");
      const completion = '{"answer": "Paris"}';
      const result = adapter.parse(signature, completion);
      expect(result).toEqual({ answer: "Paris" });
    });

    test("fallback to ChatAdapter parsing (markers)", () => {
      const signature = Signature.parse("question -> answer");
      const completion = "[[ ## answer ## ]]\nParis\n\n[[ ## completed ## ]]";
      const result = adapter.parse(signature, completion);
      expect(result).toEqual({ answer: "Paris" });
    });

    test("parsing error on invalid JSON and missing markers", () => {
      const signature = Signature.parse("question -> answer");
      const completion = "Invalid response";
      expect(() => adapter.parse(signature, completion)).toThrow();
    });
  });

  describe("lifecycle", () => {
    test("successful run with structured output", async () => {
      const lm = new MockLM();
      const signature = Signature.parse("question -> answer");

      // Manually mock generateText to return exactly what we want to test
      lm.generateText = async (options: any) => {
        return {
          output: { answer: "Paris" },
          text: '{"answer": "Paris"}',
          finishReason: "stop",
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        } as any;
      };

      const result = await adapter.run(lm, {}, signature, [], {
        question: "What is the capital of France?",
      });

      expect((result as any).output).toEqual({ answer: "Paris" });
    });
  });
});
