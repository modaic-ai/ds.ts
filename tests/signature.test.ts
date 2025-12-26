import { expect, test, describe } from "bun:test";
import { defineSignature } from "../src/signatures/signature";
import { z } from "zod";

describe("Signature String Parsing", () => {
  test("should parse simple input -> output", () => {
    const sig = defineSignature("question -> answer");
    expect(sig.input).toBeInstanceOf(z.ZodObject);
    expect(sig.output).toBeInstanceOf(z.ZodObject);
    expect(sig.input.shape.question).toBeInstanceOf(z.ZodString);
    expect(sig.output.shape.answer).toBeInstanceOf(z.ZodString);
  });

  test("should parse explicit types", () => {
    const sig = defineSignature(
      "age: number, is_active: boolean -> score: number"
    );
    expect(sig.input.shape.age).toBeInstanceOf(z.ZodNumber);
    expect(sig.input.shape.is_active).toBeInstanceOf(z.ZodBoolean);
    expect(sig.output.shape.score).toBeInstanceOf(z.ZodNumber);
  });

  test("should parse multiple inputs and outputs", () => {
    const sig = defineSignature("a, b, c -> x, y");
    expect(Object.keys(sig.input.shape)).toEqual(["a", "b", "c"]);
    expect(Object.keys(sig.output.shape)).toEqual(["x", "y"]);
  });

  test("should handle instructions", () => {
    const instructions = "This is a test instruction";
    const sig = defineSignature("input -> output", instructions);
    expect(sig.instructions).toBe(instructions);
  });

  test("should handle missing instructions", () => {
    const sig = defineSignature("input -> output");
    expect(sig.instructions).toBeUndefined();
  });

  test("should throw error for invalid format (missing ->)", () => {
    expect(() => defineSignature("invalid signature")).toThrow(
      /Must contain exactly one "->" separator/
    );
  });

  test("should throw error for invalid format (multiple ->)", () => {
    expect(() => defineSignature("a -> b -> c")).toThrow(
      /Must contain exactly one "->" separator/
    );
  });

  test("should handle extra whitespace", () => {
    const sig = defineSignature("  input  :  number  ->  output  :  string  ");
    expect(sig.input.shape.input).toBeInstanceOf(z.ZodNumber);
    expect(sig.output.shape.output).toBeInstanceOf(z.ZodString);
  });
});
