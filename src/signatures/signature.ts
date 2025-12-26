import { z } from "zod";
import { Output, type JSONValue, type DeepPartial } from "ai";
import { type FlexibleSchema } from "@ai-sdk/provider-utils";

/**
 * Metadata for a signature field (input or output).
 */
export interface Input<T = any> {
  schema: z.ZodType<T>;
  name?: string;
  description?: string;
}

/**
 * Input helpers mirroring AI SDK's Output API.
 */
export namespace Input {
  export const text = (): Input<string> => ({
    schema: z.string(),
  });

  export const object = <T>({
    schema,
    name,
    description,
  }: {
    schema: z.ZodType<T>;
    name?: string;
    description?: string;
  }): Input<T> => ({
    schema,
    name,
    description,
  });

  export const array = <T>({
    element,
    name,
    description,
  }: {
    element: z.ZodType<T>;
    name?: string;
    description?: string;
  }): Input<T[]> => ({
    schema: z.array(element),
    name,
    description,
  });

  export const choice = <T extends string>({
    options,
    name,
    description,
  }: {
    options: T[];
    name?: string;
    description?: string;
  }): Input<T> => ({
    schema: z.enum(options as [T, ...T[]]),
    name,
    description,
  });

  export const json = ({
    name,
    description,
  }: {
    name?: string;
    description?: string;
  } = {}): Input<JSONValue> => ({
    schema: z.any() as z.ZodType<JSONValue>,
    name,
    description,
  });
}

/**
 * Re-export Output from AI SDK.
 */
export { Output };

/**
 * A Signature defines the interface for a DSPy-style predictor.
 * It includes optional instructions, an input schema, and an output schema.
 */
export type Signature<I = any, O = any> = {
  instructions?: string;
  input: I;
  output: O;
};

/**
 * Helper to infer the type of a signature field.
 */
type InferField<T> = T extends Input<infer U>
  ? U
  : T extends {
      parseCompleteOutput(
        options: { text: string },
        context: any
      ): Promise<infer U>;
    }
  ? U
  : T extends z.ZodTypeAny
  ? z.infer<T>
  : T;

export type InferSignatureInput<S extends Signature> = InferField<S["input"]>;
export type InferSignatureOutput<S extends Signature> = InferField<S["output"]>;

/**
 * Maps common string type names to Zod schemas.
 */
const mapTypeToZod = (typeStr?: string): z.ZodTypeAny => {
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
    const shape: Record<string, z.ZodTypeAny> = {};
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
 * Helper function to define a Signature with type inference.
 * Supports both object-based definitions (Zod, Input/Output helpers) and string-based inline signatures.
 *
 * @param sig Or signature definition string.
 * @param instructions Optional instructions if using a string-based signature.
 * @returns The signature object.
 */
export function defineSignature<I, O>(sig: Signature<I, O>): Signature<I, O>;
export function defineSignature(
  sigStr: string,
  instructions?: string
): Signature<z.ZodObject<any>, z.ZodObject<any>>;
export function defineSignature(
  sig: string | Signature<any, any>,
  instructions?: string
): Signature<any, any> {
  if (typeof sig === "string") {
    const parsed = parseStringSignature(sig);
    return {
      instructions,
      input: parsed.input,
      output: parsed.output,
    };
  }
  return sig;
}
