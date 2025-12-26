import { z } from "zod";

/**
 * A Signature defines the interface for a DSPy-style predictor.
 * It includes optional instructions, an input schema, and an output schema.
 * Both input and output are defined using Zod schemas.
 */
export class Signature<
  I extends z.ZodObject<any> = z.ZodObject<any>,
  O extends z.ZodObject<any> = z.ZodObject<any>
> {
  public instructions?: string;
  public input: I;
  public output: O;

  /**
   * Type-only property for input inference.
   * Use with `typeof signature.InferInput` or `SignatureInstance["InferInput"]`.
   */
  declare readonly InferInput: z.infer<I>;

  /**
   * Type-only property for output inference.
   * Use with `typeof signature.InferOutput` or `SignatureInstance["InferOutput"]`.
   */
  declare readonly InferOutput: z.infer<O>;

  constructor(sig: { instructions?: string; input: I; output: O }) {
    this.instructions = sig.instructions;
    this.input = sig.input;
    this.output = sig.output;
  }

  /**
   * Static helper to create a Signature from a string definition.
   * e.g. Signature.parse("question -> answer", "Answer the question.")
   */
  static parse(
    sigStr: string,
    instructions?: string
  ): Signature<z.ZodObject<any>, z.ZodObject<any>> {
    const parsed = parseStringSignature(sigStr);
    return new Signature({
      instructions,
      input: parsed.input,
      output: parsed.output,
    });
  }

  /**
   * Returns a new Signature with the specified field removed from either input or output.
   */
  delete(
    inputOrOutput: "input" | "output",
    name: string
  ): Signature<z.ZodObject<any>, z.ZodObject<any>> {
    const inputShape = this.input.shape;
    const outputShape = this.output.shape;

    let newInput: z.ZodObject<any> = this.input;
    let newOutput: z.ZodObject<any> = this.output;

    // Remove from input if present and requested
    if (name in inputShape && inputOrOutput === "input") {
      newInput = (this.input as z.ZodObject<any>).omit({ [name]: true } as any);
    }

    // Remove from output if present and requested
    if (name in outputShape && inputOrOutput === "output") {
      newOutput = (this.output as z.ZodObject<any>).omit({
        [name]: true,
      } as any);
    }

    return new Signature({
      instructions: this.instructions,
      input: newInput,
      output: newOutput,
    });
  }

  /**
   * Returns a new Signature with updated instructions.
   */
  withInstructions(instructions: string): Signature<I, O> {
    return new Signature({
      instructions,
      input: this.input,
      output: this.output,
    });
  }
}

/**
 * Helper to infer the input type of a signature.
 */
export type InferSignatureInput<S extends Signature<any, any>> = z.infer<
  S["input"]
>;

/**
 * Helper to infer the output type of a signature.
 */
export type InferSignatureOutput<S extends Signature<any, any>> = z.infer<
  S["output"]
>;

/**
 * Maps common string type names to Zod schemas.
 */
const mapTypeToZod = (typeStr?: string): z.ZodType => {
  switch (typeStr?.toLowerCase()) {
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "string":
    case undefined:
    case "":
      return z.string();
    default:
      // Default to string for unknown types, similar to DSPy behavior
      return z.string();
  }
};

/**
 * Parses a string-based signature like "input1: string, input2: number -> output: string"
 */
const parseStringSignature = (
  sigStr: string
): { input: z.ZodObject<any>; output: z.ZodObject<any> } => {
  const parts = sigStr.split("->");
  if (parts.length !== 2) {
    throw new Error(
      `Invalid signature string: "${sigStr}". Must contain exactly one "->" separator.`
    );
  }

  const [inputsPart, outputsPart] = parts.map((s) => s.trim());

  const parsePart = (part: string) => {
    const shape: Record<string, z.ZodType> = {};
    const fields = part
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);

    for (const field of fields) {
      const [name, type] = field.split(":").map((s) => s.trim());
      if (!name) continue;
      shape[name] = mapTypeToZod(type);
    }

    return z.object(shape);
  };

  return {
    input: parsePart(inputsPart!),
    output: parsePart(outputsPart!),
  };
};
