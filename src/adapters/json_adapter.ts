import { z } from "zod";
import { Output } from "ai";
import { ChatAdapter } from "./chat_adapter";
import type { Signature } from "../signatures/signature";
import { LM } from "../clients/lm";
import {
  getFields,
  formatFieldValue,
  getFieldDescriptionString,
  getAnnotationName,
} from "./utils";

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
    return Output.object({ schema: output });
  }

  override async run<I extends z.ZodObject<any>, O extends z.ZodObject<any>>(
    lm: LM,
    lm_kwargs: any,
    signature: Signature<I, O>,
    demos: any[],
    inputs: z.infer<I>
  ): Promise<z.infer<O>> {
    const output = this.getOutputSpec(signature.output);
    const messages = this.format(signature, demos, inputs);

    const result = (await lm.generateText({
      messages,
      output,
      ...lm_kwargs,
    })) as any;

    return result.object as z.infer<O>;
  }

  override async stream<I extends z.ZodObject<any>, O extends z.ZodObject<any>>(
    lm: LM,
    lm_kwargs: any,
    signature: Signature<I, O>,
    demos: any[],
    inputs: z.infer<I>
  ): Promise<any> {
    const output = this.getOutputSpec(signature.output);
    const messages = this.format(signature, demos, inputs);

    return await lm.streamText({
      messages,
      output,
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
        fieldTypes[name] = getAnnotationName(field as z.ZodType);
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
      const name = getAnnotationName(field);
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

  override parse<I extends z.ZodObject<any>, O extends z.ZodObject<any>>(
    _signature: Signature<I, O>,
    _completion: string
  ): z.infer<O> {
    throw new Error("Not implemented");
  }

  override format_field_with_value(
    fields: z.ZodRawShape,
    values?: Record<string, any>,
    role: "user" | "assistant" = "user"
  ): string {
    if (role === "user") {
      return Object.entries(fields)
        .map(([name]) => {
          const value = values ? values[name] : `[ ${name} ]`;
          return `[[ ## ${name} ## ]]\n${formatFieldValue(value)}`;
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

  override format_finetune_data<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(
    _signature: Signature<I, O>,
    _demos: any[],
    _inputs: z.infer<I>,
    _outputs: z.infer<O>
  ): { messages: { role: string; content: string }[] } {
    throw new Error("Not implemented");
  }
}
