import { z } from "zod";
import { type ToolSet } from "ai";

/**
 * A Signature defines the interface for a DSPy-style predictor.
 * It includes optional instructions, an input schema, and an output schema.
 * Both input and output are defined using Zod schemas.
 */
export class Signature<
  I extends z.ZodObject<any> = z.ZodObject<any>,
  O extends z.ZodObject<any> = z.ZodObject<any>,
  T extends ToolSet = ToolSet
> {
  public instructions?: string;
  public input: I;
  public output: O;
  public tools?: T;
  public prefixes: Record<string, string> = {};
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

  constructor(sig: { instructions?: string; input: I; output: O; tools?: T }) {
    this.instructions =
      sig.instructions ||
      this.generateDefaultInstructions(sig.input, sig.output);
    this.input = sig.input;
    this.output = sig.output;
    this.tools = sig.tools;

    // Initialize default prefixes
    const allFields = { ...sig.input.shape, ...sig.output.shape };
    for (const name in allFields) {
      this.prefixes[name] = infer_prefix(name) + ":";
    }
  }

  private generateDefaultInstructions(input: I, output: O): string {
    const inputFields = Object.keys(input.shape);
    const outputFields = Object.keys(output.shape);
    const inputStr = inputFields.map((f) => `\`${f}\``).join(", ");
    const outputStr = outputFields.map((f) => `\`${f}\``).join(", ");
    return `Given the fields ${inputStr}, produce the fields ${outputStr}.`;
  }

  get input_fields(): Record<string, any> {
    return this.input.shape;
  }

  get output_fields(): Record<string, any> {
    return this.output.shape;
  }

  /**
   * Static helper to create a Signature from a string definition.
   * e.g. Signature.parse("question -> answer", "Answer the question.")
   */
  static parse<To extends ToolSet = ToolSet>(
    sigStr: string,
    instructions?: string,
    tools?: To
  ): Signature<z.ZodObject<any>, z.ZodObject<any>, To> {
    const parsed = parseStringSignature(sigStr);
    return new Signature({
      instructions,
      input: parsed.input,
      output: parsed.output,
      tools,
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

  dump_state(): any {
    const fields = Object.entries({
      ...this.input.shape,
      ...this.output.shape,
    }).map(([name, field]) => ({
      prefix: this.prefixes[name],
      description:
        (field as any).meta?.()?.description ||
        (field as any).meta?.()?.desc ||
        (field as any)._def?.description ||
        "",
    }));

    return {
      instructions: this.instructions,
      fields,
    };
  }

  load_state(state: any): Signature<z.ZodObject<any>, z.ZodObject<any>, T> {
    const prefixToName: Record<string, string> = {};
    for (const [name, prefix] of Object.entries(this.prefixes)) {
      prefixToName[prefix] = name;
    }

    const inputPatch: Record<string, z.ZodType> = {};
    const outputPatch: Record<string, z.ZodType> = {};

    for (const fieldState of state.fields) {
      const name = prefixToName[fieldState.prefix];
      if (!name) continue;

      const isInput = name in this.input.shape;
      const field = (
        isInput ? this.input.shape[name] : this.output.shape[name]
      ) as z.ZodType;

      let updatedField = field;
      const description = fieldState.description;

      updatedField = updatedField.describe(description);

      if (typeof (updatedField as any).meta === "function") {
        const currentMeta = (updatedField as any).meta() || {};
        updatedField = (updatedField as any).meta({
          ...currentMeta,
          description,
          desc: description,
        });
      }

      if (isInput) {
        inputPatch[name] = updatedField;
      } else {
        outputPatch[name] = updatedField;
      }
    }

    return new Signature({
      instructions: state.instructions,
      input: this.input.extend(inputPatch),
      output: this.output.extend(outputPatch),
      tools: this.tools,
    }) as any;
  }
}

/**
 * Helper to infer the input type of a signature.
 */
export type InferInput<S extends Signature<any, any, any>> = z.infer<
  S["input"]
>;

/**
 * Helper to infer the output type of a signature.
 */
export type InferOutput<S extends Signature<any, any, any>> = z.infer<
  S["output"]
>;

export type InferTools<S extends Signature<any, any, any>> =
  S extends Signature<any, any, infer T> ? T : never;

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

/**
 * Infer a prefix from an attribute name by converting it to a human-readable format.
 * Matches the logic in DSPy's infer_prefix.
 *
 * Examples:
 *   "camelCaseText" -> "Camel Case Text"
 *   "snake_case_text" -> "Snake Case Text"
 *   "text2number" -> "Text 2 Number"
 *   "HTMLParser" -> "HTML Parser"
 */
export function infer_prefix(attributeName: string): string {
  // Step 1: Convert camelCase to snake_case
  // Example: "camelCase" -> "camel_Case"
  const s1 = attributeName.replace(/(.)([A-Z][a-z]+)/g, "$1_$2");

  // Handle consecutive capitals
  // Example: "camel_Case" -> "camel_case"
  const intermediateName = s1.replace(/([a-z0-9])([A-Z])/g, "$1_$2");

  // Step 2: Handle numbers by adding underscores around them
  // Example: "text2number" -> "text_2_number"
  let withUnderscoresAroundNumbers = intermediateName.replace(
    /([a-zA-Z])(\d)/g,
    "$1_$2"
  );
  // Example: "2text" -> "2_text"
  withUnderscoresAroundNumbers = withUnderscoresAroundNumbers.replace(
    /(\d)([a-zA-Z])/g,
    "$1_$2"
  );

  // Step 3: Convert to Title Case while preserving acronyms
  const words = withUnderscoresAroundNumbers.split("_");
  const titleCasedWords = words.map((word) => {
    if (word === word.toUpperCase() && word !== word.toLowerCase()) {
      // Preserve acronyms like 'HTML', 'API' as-is
      return word;
    }
    // Capitalize first letter: 'text' -> 'Text'
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });

  // Join words with spaces
  // Example: ["Text", "2", "Number"] -> "Text 2 Number"
  return titleCasedWords.join(" ");
}
