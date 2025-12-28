import { z } from "zod";
import {
  Output,
  type StreamTextResult,
  type ToolSet,
  type GenerateTextResult,
} from "ai";
import { ChatAdapter, sameKeys } from "./chat_adapter";
import type { Signature } from "../signatures/signature";
import { LM } from "../clients/lm";
import {
  getFields,
  format_field_value,
  get_field_description_string,
  get_annotation_name,
  parseValue,
} from "./utils";
import { AdapterParseError } from "../exceptions";

/**
 * JSONAdapter is an adapter that uses the AI SDK's structured output
 * capabilities (via the `output` parameter in generateText/streamText).
 *
 * It formats the inputs and demos using the DSPy chat interaction pattern
 * but ensures assistant messages are formatted as JSON.
 */
export class JSONAdapter extends ChatAdapter {
  /**
   * Helper to ensure the output is an AI SDK Output spec.
   * Since signatures now use Zod schemas directly, we wrap them
   * in Output.object for the AI SDK.
   */
  private getOutputSpec(output: z.ZodObject<any>): any {
    const spec = Output.object({ schema: output }) as any;
    spec.schema = output;
    return spec;
  }

  override async run<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>,
    T extends ToolSet
  >(
    lm: LM,
    lm_kwargs: any,
    signature: Signature<I, O, T>,
    demos: any[],
    inputs: z.infer<I>
  ): Promise<GenerateTextResult<T, Output.Output<z.infer<O>>>> {
    const output = this.getOutputSpec(signature.output);
    const messages = this.format(signature, demos, inputs);

    const result = (await lm.generateText({
      messages,
      output,
      tools: signature.tools,
      ...lm_kwargs,
    })) as any;

    return result;
  }

  override async stream<I extends z.ZodObject<any>, O extends z.ZodObject<any>>(
    lm: LM,
    lm_kwargs: any,
    signature: Signature<I, O>,
    demos: any[],
    inputs: z.infer<I>
  ): Promise<StreamTextResult<any, any>> {
    const output = this.getOutputSpec(signature.output);
    const messages = this.format(signature, demos, inputs);

    return await lm.streamText({
      messages,
      output,
      tools: signature.tools,
      ...lm_kwargs,
    });
  }
  override format_field_structure<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(signature: Signature<I, O>): string {
    const inputFields = getFields(signature.input);
    const outputFields = getFields(signature.output);

    const parts = [
      "All interactions will be structured in the following way, with the appropriate values filled in.",
    ];

    const formatFields = (
      fields: z.ZodRawShape,
      role: "user" | "assistant"
    ) => {
      const fieldTypes: Record<string, string> = {};
      for (const [name, field] of Object.entries(fields)) {
        fieldTypes[name] = get_annotation_name(field as z.ZodType);
      }
      return this.format_field_with_value(fields, fieldTypes, role);
    };

    parts.push("Inputs will have the following structure:");
    parts.push(formatFields(inputFields, "user"));
    parts.push("Outputs will be a JSON object with the following fields.");
    parts.push(formatFields(outputFields, "assistant"));

    return parts.join("\n\n").trim();
  }

  override user_message_output_requirements<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(signature: Signature<I, O>): string {
    const outputFields = getFields(signature.output);

    const typeInfo = (field: any) => {
      const name = get_annotation_name(field);
      return name !== "string"
        ? ` (must be formatted as a valid Python ${name})`
        : "";
    };

    let message =
      "Respond with a JSON object in the following order of fields: ";
    message += Object.entries(outputFields)
      .map(([f, v]) => `\`${f}\`${typeInfo(v)}`)
      .join(", then ");
    message += ".";
    return message;
  }

  override format_assistant_message_content<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(signature: Signature<I, O>, outputs: z.infer<O>): string {
    const outputFields = getFields(signature.output);
    return this.format_field_with_value(
      outputFields,
      outputs as any,
      "assistant"
    );
  }

  override format_field_with_value(
    fields: z.ZodRawShape,
    values?: Record<string, any>,
    role: "user" | "assistant" = "user"
  ): string {
    if (role === "user") {
      return Object.entries(fields)
        .map(([name, type]) => {
          const value = values ? values[name] : `[ ${name} ]`;
          return `[[ ## ${name} ## ]]\n${format_field_value(
            type as z.ZodType,
            value
          )}`;
        })
        .join("\n\n");
    } else {
      const result: Record<string, any> = {};
      for (const [name] of Object.entries(fields)) {
        result[name] = values ? values[name] : `[ ${name} ]`;
      }
      return JSON.stringify(result, null, 2);
    }
  }

  override parse<I extends z.ZodObject<any>, O extends z.ZodObject<any>>(
    signature: Signature<I, O>,
    completion: string,
    allow_partial_output: boolean = false
  ): z.infer<O> {
    try {
      const data = JSON.parse(completion);
      const result: Record<string, any> = {};
      for (const [name, type] of Object.entries(signature.output_fields)) {
        if (name in data) {
          result[name] = parseValue(type as z.ZodType, data[name]);
        }
      }

      if (!sameKeys(signature.output_fields, result) && !allow_partial_output) {
        throw new AdapterParseError(
          "JSONAdapter",
          signature,
          completion,
          `Expected output fields: ${Object.keys(signature.output_fields).join(
            ", "
          )}`,
          result
        );
      }
      return result as z.infer<O>;
    } catch (e) {
      if (e instanceof AdapterParseError) throw e;
      // Fallback to ChatAdapter's marker-based parsing if JSON parsing fails
      return super.parse(signature, completion, allow_partial_output);
    }
  }
}
