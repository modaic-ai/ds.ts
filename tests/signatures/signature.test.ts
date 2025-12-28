import { expect, test, describe } from "bun:test";
import { Signature } from "../../src/signatures/signature";
import { infer_prefix } from "../../src/signatures/signature";
import { z } from "zod";

describe("Signature Class", () => {
  describe("Constructor", () => {
    test("should be created with explicit instructions", () => {
      const sig = new Signature({
        instructions: "test instructions",
        input: z.object({ a: z.string() }),
        output: z.object({ b: z.string() }),
      });
      expect(sig.instructions).toBe("test instructions");
      expect(sig.input.shape.a).toBeInstanceOf(z.ZodString);
      expect(sig.output.shape.b).toBeInstanceOf(z.ZodString);
    });

    test("should generate default instructions when none provided", () => {
      const sig = new Signature({
        input: z.object({ question: z.string(), context: z.string() }),
        output: z.object({ answer: z.string() }),
      });
      expect(sig.instructions).toBe(
        "Given the fields `question`, `context`, produce the fields `answer`."
      );
    });
  });

  describe("Field Management", () => {
    test("should support delete method (side-specific)", () => {
      const sig = new Signature({
        input: z.object({ a: z.string(), b: z.number() }),
        output: z.object({ c: z.string(), b: z.number() }),
      });

      // Delete from input
      const newSigInput = sig.delete("input", "b");
      expect(newSigInput.input.shape.b).toBeUndefined();
      expect(newSigInput.output.shape.b).toBeInstanceOf(z.ZodNumber);
      expect(newSigInput).not.toBe(sig);

      // Delete from output
      const newSigOutput = sig.delete("output", "b");
      expect(newSigOutput.output.shape.b).toBeUndefined();
      expect(newSigOutput.input.shape.b).toBeInstanceOf(z.ZodNumber);
      expect(newSigOutput).not.toBe(sig);

      // Verify original is untouched
      expect(sig.input.shape.b).toBeInstanceOf(z.ZodNumber);
      expect(sig.output.shape.b).toBeInstanceOf(z.ZodNumber);
    });

    test("should support withInstructions method (immutable)", () => {
      const sig = new Signature({
        input: z.object({ a: z.string() }),
        output: z.object({ b: z.string() }),
      });

      const newSig = sig.withInstructions("new instructions");
      expect(newSig.instructions).toBe("new instructions");
      expect(newSig.input).toBe(sig.input);
      expect(newSig.output).toBe(sig.output);
      expect(newSig).not.toBe(sig);
    });

    test("should provide input_fields and output_fields getters", () => {
      const sig = new Signature({
        input: z.object({ a: z.string() }),
        output: z.object({ b: z.number() }),
      });
      expect(sig.input_fields.a).toBeInstanceOf(z.ZodString);
      expect(sig.output_fields.b).toBeInstanceOf(z.ZodNumber);
    });
  });
});

describe("Signature String Parsing", () => {
  test("should parse simple input -> output with default instructions", () => {
    const sig = Signature.parse("question -> answer");
    expect(sig.input.shape.question).toBeInstanceOf(z.ZodString);
    expect(sig.output.shape.answer).toBeInstanceOf(z.ZodString);
    expect(sig.instructions).toBe(
      "Given the fields `question`, produce the fields `answer`."
    );
  });

  test("should parse explicit types", () => {
    const sig = Signature.parse(
      "age: number, is_active: boolean -> score: number"
    );
    expect(sig.input.shape.age).toBeInstanceOf(z.ZodNumber);
    expect(sig.input.shape.is_active).toBeInstanceOf(z.ZodBoolean);
    expect(sig.output.shape.score).toBeInstanceOf(z.ZodNumber);
  });

  test("should default to string for unknown or missing types", () => {
    const sig = Signature.parse("a: unknown, b -> c: string");
    expect(sig.input.shape.a).toBeInstanceOf(z.ZodString);
    expect(sig.input.shape.b).toBeInstanceOf(z.ZodString);
    expect(sig.output.shape.c).toBeInstanceOf(z.ZodString);
  });

  test("should handle multiple inputs and outputs", () => {
    const sig = Signature.parse("a, b, c -> x, y");
    expect(Object.keys(sig.input.shape)).toEqual(["a", "b", "c"]);
    expect(Object.keys(sig.output.shape)).toEqual(["x", "y"]);
  });

  test("should handle extra whitespace", () => {
    const sig = Signature.parse("  input  :  number  ->  output  :  string  ");
    expect(sig.input.shape.input).toBeInstanceOf(z.ZodNumber);
    expect(sig.output.shape.output).toBeInstanceOf(z.ZodString);
  });

  test("should throw error for invalid format", () => {
    expect(() => Signature.parse("invalid signature")).toThrow(
      /Must contain exactly one "->" separator/
    );
    expect(() => Signature.parse("a -> b -> c")).toThrow(
      /Must contain exactly one "->" separator/
    );
  });
});

describe("Signature State Management", () => {
  test("should dump and load state correctly (DSPy-style)", () => {
    const sig1 = new Signature({
      instructions: "I am just an instruction.",
      input: z.object({
        sentence: z.string().describe("I am an innocent input!"),
      }),
      output: z.object({
        sentiment: z.string(),
      }),
    });

    const state = sig1.dump_state();
    expect(state).toEqual({
      instructions: "I am just an instruction.",
      fields: [
        {
          prefix: "Sentence:",
          description: "I am an innocent input!",
        },
        {
          prefix: "Sentiment:",
          description: "",
        },
      ],
    });

    const sig2 = new Signature({
      instructions: "I am a malicious instruction.",
      input: z.object({
        sentence: z.string().describe("I am a malicious input!"),
      }),
      output: z.object({
        sentiment: z.string(),
      }),
    });

    expect(sig2.dump_state()).not.toEqual(state);

    // Overwrite the state with the state of sig1
    const loadedSig = sig2.load_state(state);
    expect(loadedSig.instructions).toBe("I am just an instruction.");

    // After load_state, the state should be the same as sig1
    expect(loadedSig.dump_state()).toEqual(state);

    // sig2 should not have been modified (immutability)
    expect(sig2.instructions).toBe("I am a malicious instruction.");
    expect((sig2.input.shape.sentence as any).description).toBe(
      "I am a malicious input!"
    );
  });

  test("should handle missing prefixes in load_state gracefully", () => {
    const sig = new Signature({
      input: z.object({ a: z.string() }),
      output: z.object({ b: z.string() }),
    });

    const state = {
      instructions: "new",
      fields: [{ prefix: "Unknown:", description: "should be ignored" }],
    };

    const newSig = sig.load_state(state);
    expect(newSig.instructions).toBe("new");
    expect(newSig.input.shape.a).toBe(sig.input.shape.a);
    expect(newSig.output.shape.b).toBe(sig.output.shape.b);
  });
});

describe("infer_prefix", () => {
  test("should handle camelCaseText", () => {
    expect(infer_prefix("camelCaseText")).toBe("Camel Case Text");
  });

  test("should handle snake_case_text", () => {
    expect(infer_prefix("snake_case_text")).toBe("Snake Case Text");
  });

  test("should handle text2number", () => {
    expect(infer_prefix("text2number")).toBe("Text 2 Number");
  });

  test("should handle 2number", () => {
    expect(infer_prefix("2number")).toBe("2 Number");
  });

  test("should handle HTMLParser", () => {
    expect(infer_prefix("HTMLParser")).toBe("HTML Parser");
  });

  test("should handle consecutive capitals", () => {
    expect(infer_prefix("someHTMLParser")).toBe("Some HTML Parser");
  });

  test("should preserve acronyms", () => {
    expect(infer_prefix("JSONData")).toBe("JSON Data");
    expect(infer_prefix("userID")).toBe("User ID");
  });

  test("should handle mixed cases and numbers", () => {
    expect(infer_prefix("myAPI2Response")).toBe("My API 2 Response");
  });
});

describe("Signature.load_state", () => {
  test("should restore instructions and field descriptions", () => {
    const sig = new Signature({
      instructions: "Original instructions",
      input: z.object({
        question: z.string().describe("original question desc"),
      }),
      output: z.object({
        answer: z.string().describe("original answer desc"),
      }),
    });

    const state = {
      instructions: "New instructions",
      fields: [
        { prefix: "Question:", description: "new question desc" },
        { prefix: "Answer:", description: "new answer desc" },
      ],
    };

    const newSig = sig.load_state(state);

    expect(newSig.instructions).toBe("New instructions");

    // Check input field description
    const questionField = newSig.input.shape.question as any;
    expect(questionField.description).toBe("new question desc");

    // Check output field description
    const answerField = newSig.output.shape.answer as any;
    expect(answerField.description).toBe("new answer desc");

    // Check that prefixes are preserved/correctly mapped
    expect(newSig.prefixes["question"]).toBe("Question:");
    expect(newSig.prefixes["answer"]).toBe("Answer:");
  });

  test("should preserve schema modifiers (passthrough)", () => {
    const sig = new Signature({
      input: z.object({ q: z.string() }).passthrough(),
      output: z.object({ a: z.string() }),
    });

    const state = {
      instructions: sig.instructions,
      fields: [
        { prefix: "Q:", description: "new q" },
        { prefix: "A:", description: "new a" },
      ],
    };

    const newSig = sig.load_state(state);

    // Verify passthrough is preserved
    const result = newSig.input.safeParse({ q: "test", extra: "should stay" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty("extra");
    }
  });

  test("should work with .meta() metadata", () => {
    const sig = new Signature({
      input: z.object({
        field: (z.string() as any).meta({ original: true, description: "old" }),
      }),
      output: z.object({
        out: z.string(),
      }),
    });

    const state = {
      instructions: sig.instructions,
      fields: [
        { prefix: "Field:", description: "new" },
        { prefix: "Out:", description: "" },
      ],
    };

    const newSig = sig.load_state(state);
    const field = newSig.input.shape.field as any;

    expect(field.meta().description).toBe("new");
    expect(field.meta().desc).toBe("new");
    expect(field.meta().original).toBe(true); // preserved meta
  });
});
