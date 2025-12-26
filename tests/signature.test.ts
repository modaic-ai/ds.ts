import { expect, test, describe } from "bun:test";
import { Signature } from "../src/signatures/signature";
import { z } from "zod";

describe("Signature Class", () => {
  test("should be created with constructor", () => {
    const sig = new Signature({
      instructions: "test instructions",
      input: z.object({ a: z.string() }),
      output: z.object({ b: z.string() }),
    });
    expect(sig.instructions).toBe("test instructions");
    expect(sig.input.shape.a).toBeInstanceOf(z.ZodString);
    expect(sig.output.shape.b).toBeInstanceOf(z.ZodString);
  });

  test("should support delete method", () => {
    const sig = new Signature({
      input: z.object({ a: z.string(), b: z.number() }),
      output: z.object({ c: z.string(), b: z.number() }),
    });

    // Delete from both by default
    const newSigBoth = sig.delete("input", "b");
    expect(newSigBoth.input.shape.a).toBeInstanceOf(z.ZodString);
    expect(newSigBoth.input.shape.b).toBeUndefined();
    expect(newSigBoth.output.shape.c).toBeInstanceOf(z.ZodString);
    expect(newSigBoth.output.shape.b).toBeInstanceOf(z.ZodNumber);

    // Delete from input only
    const newSigInput = sig.delete("input", "b");
    expect(newSigInput.input.shape.b).toBeUndefined();
    expect(newSigInput.output.shape.b).toBeInstanceOf(z.ZodNumber);

    // Delete from output only
    const newSigOutput = sig.delete("output", "b");
    expect(newSigOutput.input.shape.b).toBeInstanceOf(z.ZodNumber);
    expect(newSigOutput.output.shape.b).toBeUndefined();

    expect(newSigBoth).not.toBe(sig); // Should be a new instance
  });

  test("should support withInstructions method", () => {
    const sig = new Signature({
      input: z.object({ a: z.string() }),
      output: z.object({ b: z.string() }),
    });

    const newSig = sig.withInstructions("new instructions");
    expect(newSig.instructions).toBe("new instructions");
    expect(newSig.input).toBe(sig.input);
    expect(newSig.output).toBe(sig.output);
  });
});

describe("Signature String Parsing", () => {
  test("should parse simple input -> output", () => {
    const sig = Signature.parse("question -> answer");
    expect(sig.input).toBeInstanceOf(z.ZodObject);
    expect(sig.output).toBeInstanceOf(z.ZodObject);
    expect(sig.input.shape.question).toBeInstanceOf(z.ZodString);
    expect(sig.output.shape.answer).toBeInstanceOf(z.ZodString);
  });

  test("should parse explicit types", () => {
    const sig = Signature.parse(
      "age: number, is_active: boolean -> score: number"
    );
    expect(sig.input.shape.age).toBeInstanceOf(z.ZodNumber);
    expect(sig.input.shape.is_active).toBeInstanceOf(z.ZodBoolean);
    expect(sig.output.shape.score).toBeInstanceOf(z.ZodNumber);
  });

  test("should parse multiple inputs and outputs", () => {
    const sig = Signature.parse("a, b, c -> x, y");
    expect(Object.keys(sig.input.shape)).toEqual(["a", "b", "c"]);
    expect(Object.keys(sig.output.shape)).toEqual(["x", "y"]);
  });

  test("should handle instructions", () => {
    const instructions = "This is a test instruction";
    const sig = Signature.parse("input -> output", instructions);
    expect(sig.instructions).toBe(instructions);
  });

  test("should handle missing instructions", () => {
    const sig = Signature.parse("input -> output");
    expect(sig.instructions).toBeUndefined();
  });

  test("should throw error for invalid format (missing ->)", () => {
    expect(() => Signature.parse("invalid signature")).toThrow(
      /Must contain exactly one "->" separator/
    );
  });

  test("should throw error for invalid format (multiple ->)", () => {
    expect(() => Signature.parse("a -> b -> c")).toThrow(
      /Must contain exactly one "->" separator/
    );
  });

  test("should handle extra whitespace", () => {
    const sig = Signature.parse("  input  :  number  ->  output  :  string  ");
    expect(sig.input.shape.input).toBeInstanceOf(z.ZodNumber);
    expect(sig.output.shape.output).toBeInstanceOf(z.ZodString);
  });
});
