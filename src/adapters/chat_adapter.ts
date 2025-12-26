import { z } from "zod";
import { Adapter } from "./base";
import type { Signature } from "../signatures/signature";
import { LM } from "../clients/lm";
import {
  getFields,
  getFieldDescriptionString,
  format_field_value,
  parseValue,
} from "./utils";

/**
 * ChatAdapter implements the DSPy-style chat interaction pattern.
 * It uses specialized markers [[ ## field_name ## ]] to structure inputs and outputs
 * within a standard chat conversation.
 *
 * In ds.ts, the base Adapter class provides the default chat formatting logic.
 * ChatAdapter adds fallback logic to JSONAdapter on failure.
 */
export class ChatAdapter extends Adapter {
  constructor(use_json_adapter_fallback: boolean = true) {
    super();
    this.use_json_adapter_fallback = use_json_adapter_fallback;
  }

  public use_json_adapter_fallback: boolean;

  override async run<I extends z.ZodObject<any>, O extends z.ZodObject<any>>(
    lm: LM,
    lm_kwargs: any,
    signature: Signature<I, O>,
    demos: any[],
    inputs: z.infer<I>
  ): Promise<z.infer<O>> {
    try {
      return await super.run(lm, lm_kwargs, signature, demos, inputs);
    } catch (e) {
      // Fallback to JSONAdapter logic
      const { JSONAdapter } = await import("./json_adapter");
      if (this instanceof JSONAdapter || !this.use_json_adapter_fallback) {
        // On context window exceeded error, already using JSONAdapter, or use_json_adapter_fallback is False
        // we don't want to retry with a different adapter. Raise the original error instead of the fallback error.
        throw e;
      }
      const jsonAdapter = new JSONAdapter();
      return await jsonAdapter.run(lm, lm_kwargs, signature, demos, inputs);
    }
  }

  override async stream<I extends z.ZodObject<any>, O extends z.ZodObject<any>>(
    lm: LM,
    lm_kwargs: any,
    signature: Signature<I, O>,
    demos: any[],
    inputs: z.infer<I>
  ): Promise<any> {
    try {
      return await super.stream(lm, lm_kwargs, signature, demos, inputs);
    } catch (e) {
      // Fallback to JSONAdapter logic
      const { JSONAdapter } = await import("./json_adapter");

      if (this instanceof JSONAdapter || !this.use_json_adapter_fallback) {
        throw e;
      }

      const jsonAdapter = new JSONAdapter();
      return await jsonAdapter.stream(lm, lm_kwargs, signature, demos, inputs);
    }
  }

  override format_field_description<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(signature: Signature<I, O>): string {
    const inputFields = getFields(signature.input);
    const outputFields = getFields(signature.output);

    return (
      `Your input fields are:\n${getFieldDescriptionString(inputFields)}\n` +
      `Your output fields are:\n${getFieldDescriptionString(outputFields)}`
    );
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

    parts.push(this.format_field_with_value(inputFields));
    parts.push(this.format_field_with_value(outputFields));
    parts.push("[[ ## completed ## ]]\n");

    return parts.join("\n\n").trim();
  }

  format_signature_fields_for_instructions(fields: z.ZodRawShape): string {
    return Object.entries(fields)
      .map(([name]) => {
        return `[[ ## ${name} ## ]]\n${format_field_value(name)}`;
      })
      .join("\n\n");
  }

  override format_task_description<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(signature: Signature<I, O>): string {
    const instructions = signature.instructions || "";
    return `In adhering to this structure, your objective is: ${instructions}`;
  }

  override format_user_message_content<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(
    signature: Signature<I, O>,
    inputs: z.infer<I>,
    {
      prefix = "",
      suffix = "",
      main_request = false,
    }: { prefix?: string; suffix?: string; main_request?: boolean } = {}
  ): string {
    const inputFields = getFields(signature.input);
    const messages = [prefix];

    for (const [name] of Object.entries(inputFields)) {
      if (name in (inputs as any)) {
        const value = (inputs as any)[name];
        messages.push(`[[ ## ${name} ## ]]\n${formatFieldValue(value)}`);
      }
    }

    if (main_request) {
      messages.push(this.user_message_output_requirements(signature));
    }

    messages.push(suffix);
    return messages.filter(Boolean).join("\n\n").trim();
  }

  user_message_output_requirements<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(signature: Signature<I, O>): string {
    const outputFields = getFields(signature.output);
    const fieldNames = Object.keys(outputFields);

    let message = `Respond with the corresponding output fields, starting with the field `;
    message += fieldNames.map((f) => `\`[[ ## ${f} ## ]]\``).join(", then ");
    message += ", and then ending with the marker for `[[ ## completed ## ]]`.";
    return message;
  }

  override format_assistant_message_content<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(
    signature: Signature<I, O>,
    outputs: z.infer<O>,
    options?: { missing_field_message?: string }
  ): string {
    const outputFields = getFields(signature.output);
    let content = this.format_field_with_value(
      outputFields,
      outputs as any,
      "assistant"
    );
    content += "\n\n[[ ## completed ## ]]\n";
    return content;
  }

  override parse<I extends z.ZodObject<any>, O extends z.ZodObject<any>>(
    signature: Signature<I, O>,
    completion: string
  ): z.infer<O> {
    const outputFields = getFields(signature.output);
    const sections: Record<string, string> = {};
    const fieldNames = Object.keys(outputFields);

    const lines = completion.split("\n");
    let currentField: string | null = null;
    let currentContent: string[] = [];

    const fieldHeaderRegex = /^\[\[ ## (\w+) ## \]\]/;

    for (const line of lines) {
      const match = line.trim().match(fieldHeaderRegex);
      if (match) {
        if (currentField && fieldNames.includes(currentField)) {
          sections[currentField] = currentContent.join("\n").trim();
        }
        currentField = match[1] ?? null;
        currentContent = [];
        const remaining = line.replace(match[0], "").trim();
        if (remaining) currentContent.push(remaining);
      } else {
        currentContent.push(line);
      }
    }

    if (currentField && fieldNames.includes(currentField)) {
      sections[currentField] = currentContent.join("\n").trim();
    }

    const result: any = {};
    for (const [name, schema] of Object.entries(outputFields)) {
      if (name in sections) {
        result[name] = parseValue(schema as z.ZodType, sections[name] ?? "");
      }
    }

    return result as z.infer<O>;
  }

  format_field_with_value(
    fields: z.ZodRawShape,
    values: Record<string, any>
  ): string {
    return Object.entries(fields)
      .map(([name]) => {
        const value = values ? values[name] : `[ ${name} ]`;
        return `[[ ## ${name} ## ]]\n${formatFieldValue(value)}`;
      })
      .join("\n\n");
  }

  format_finetune_data<I extends z.ZodObject<any>, O extends z.ZodObject<any>>(
    signature: Signature<I, O>,
    demos: any[],
    inputs: z.infer<I>,
    outputs: z.infer<O>
  ): { messages: { role: string; content: string }[] } {
    const messages = (this.format(signature, demos, inputs) as any[]).map(
      (m) => ({
        role: m.role,
        content: m.content,
      })
    );
    messages.push({
      role: "assistant",
      content: this.format_assistant_message_content(signature, outputs),
    });
    return { messages };
  }
}
