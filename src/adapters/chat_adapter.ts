import { z } from "zod";
import type { StreamTextResult, ToolSet, Output, GenerateTextResult } from "ai";
import { Adapter } from "./base";
import type { Signature } from "../signatures/signature";
import { LM } from "../clients/lm";
import {
  getFields,
  get_field_description_string,
  format_field_value,
  parseValue,
  translate_field_type,
  get_annotation_name,
} from "./utils";
import { AdapterParseError } from "../exceptions";
/**
 * ChatAdapter implements the DSPy-style chat interaction pattern.
 * It uses specialized markers [[ ## field_name ## ]] to structure inputs and outputs
 * within a standard chat conversation.
 *
 * In ds.ts, the base Adapter class provides the default chat formatting logic.
 * ChatAdapter adds fallback logic to JSONAdapter on failure.
 */

// Same as dspy's regex pattern re.compile(r"\[\[ ## (\w+) ## \]\]")
// the extra ^ at the beginning is because match in python and match in js behave differently. This ensures they behave the same.
const FIELD_HEADER_PATTERN = /^\[\[ ## (\w+) ## \]\]/;
export class ChatAdapter extends Adapter {
  constructor(use_json_adapter_fallback: boolean = true) {
    super();
    this.use_json_adapter_fallback = use_json_adapter_fallback;
  }

  public use_json_adapter_fallback: boolean;

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

  override async stream<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>,
    T extends ToolSet
  >(
    lm: LM,
    lm_kwargs: any,
    signature: Signature<I, O, T>,
    demos: any[],
    inputs: z.infer<I>
  ): Promise<StreamTextResult<T, Output.Output<z.infer<O>>>> {
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
  /**
   * NOTE: aligned with dspy [x]
   */
  override format_field_description<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(signature: Signature<I, O>): string {
    const inputFields = getFields(signature.input);
    const outputFields = getFields(signature.output);

    return (
      `Your input fields are:\n${get_field_description_string(inputFields)}\n` +
      `Your output fields are:\n${get_field_description_string(outputFields)}`
    );
  }

  /**
   * NOTE: aligned with dspy [x]
   */
  override format_field_structure<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(signature: Signature<I, O>): string {
    const inputFields = getFields(signature.input);
    const outputFields = getFields(signature.output);

    const parts = [
      "All interactions will be structured in the following way, with the appropriate values filled in.",
    ];

    const inputTypes = Object.fromEntries(
      Object.entries(inputFields).map(([name, type]) => [
        name,
        translate_field_type(name, type as z.ZodType),
      ])
    );

    const outputTypes = Object.fromEntries(
      Object.entries(outputFields).map(([name, type]) => [
        name,
        translate_field_type(name, type as z.ZodType),
      ])
    );

    parts.push(this.format_field_with_value(inputFields, inputTypes));
    parts.push(this.format_field_with_value(outputFields, outputTypes));
    parts.push("[[ ## completed ## ]]\n");

    return parts.join("\n\n").trim();
  }

  /**
   * NOTE: aligned with dspy [x] (differences in formatting)
   */
  override format_task_description<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(signature: Signature<I, O>): string {
    const instructions = signature.instructions || "";
    return `In adhering to this structure, your objective is: ${instructions}`;
  }

  /**
   * NOTE: aligned with dspy [x]
   */
  override format_user_message_content<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(
    signature: Signature<I, O>,
    inputs: z.infer<I>,
    context: Record<string, { type: z.ZodType; value: any }>,
    {
      prefix = "",
      suffix = "",
      main_request = false,
    }: { prefix?: string; suffix?: string; main_request?: boolean } = {}
  ): string {
    const inputFields = getFields(signature.input);
    const messages = [prefix];

    for (const [k, type] of Object.entries(inputFields)) {
      if (k in inputs) {
        const value = inputs[k];
        const formatted_field_value = format_field_value(
          type as z.ZodType,
          value,
          context
        );
        messages.push(`[[ ## ${k} ## ]]\n${formatted_field_value}`);
      }
    }

    if (main_request) {
      const output_requirements =
        this.user_message_output_requirements(signature);

      messages.push(this.user_message_output_requirements(signature));
    }

    messages.push(suffix);
    return messages.filter(Boolean).join("\n\n").trim();
  }
  /**
   * NOTE: aligned with dspy [x]
   * Returns a simplified format reminder for the language model.
   *
   * In chat-based interactions, language models may lose track of the required output format
   * as the conversation context grows longer. This method generates a concise reminder of
   * the expected output structure that can be included in user messages.
   *
   * @param signature - The DSPy signature defining the expected input/output fields.
   * @returns A simplified description of the required output format.
   *
   * @remarks
   * This is a more lightweight version of `format_field_structure` specifically designed
   * for inline reminders within chat messages.
   */
  user_message_output_requirements<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(signature: Signature<I, O>): string {
    const outputFields = getFields(signature.output);

    let message = `Respond with the corresponding output fields, starting with the field `;
    message += Object.entries(outputFields)
      .map(([f, v]) => `\`[[ ## ${f} ## ]]\`${type_info(v as z.ZodType)}`)
      .join(", then ");
    message += ", and then ending with the marker for `[[ ## completed ## ]]`.";
    return message;
  }

  /**
   * NOTE: aligned with dspy [x]
   */
  override format_assistant_message_content<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(
    signature: Signature<I, O>,
    outputs: z.infer<O>,
    options?: { missing_field_message?: string }
  ): string {
    const outputFields = getFields(signature.output);
    const outputs_map = Object.fromEntries(
      Object.entries(outputFields).map(([name, type]) => [
        name,
        outputs[name] ?? options?.missing_field_message,
      ])
    );
    let content = this.format_field_with_value(outputFields, outputs_map);
    content += "\n\n[[ ## completed ## ]]\n";
    return content;
  }

  /**
   * NOTE: aligned with dspy [x]
   */
  override parse<I extends z.ZodObject<any>, O extends z.ZodObject<any>>(
    signature: Signature<I, O>,
    completion: string,
    allow_partial_output: boolean = false
  ): z.infer<O> {
    const sections: [string | null, string[]][] = [[null, []]];

    for (const line of completion.split(/\r?\n/)) {
      const trimmed = line.trim();
      const match = FIELD_HEADER_PATTERN.exec(trimmed);

      if (match) {
        const header = match[1] ?? "";
        const remainingContent = trimmed.slice(match[0].length).trim();
        sections.push([header, remainingContent ? [remainingContent] : []]);
      } else {
        sections[sections.length - 1]![1].push(line);
      }
    }

    const sectionMap = sections.map(
      ([k, v]) => [k, v.join("\n").trim()] as [string | null, string]
    );

    const result: Record<string, any> = {};
    for (const [k, v] of sectionMap) {
      if (k !== null && !(k in result) && k in signature.output_fields) {
        try {
          result[k] = parseValue(signature.output_fields[k] as z.ZodType, v);
        } catch (e) {
          if (allow_partial_output) {
            result[k] = v;
            continue;
          }
          throw new AdapterParseError(
            "ChatAdapter",
            signature,
            completion,
            `Failed to parse field ${k} with value ${v} from the LM response. Error message: ${
              e instanceof Error ? e.message : String(e)
            }`
          );
        }
      }
    }

    if (!sameKeys(signature.output_fields, result) && !allow_partial_output) {
      throw new AdapterParseError(
        "ChatAdapter",
        signature,
        completion,
        `Expected output fields: ${Object.keys(signature.output_fields).join(
          ", "
        )}`,
        result
      );
    }
    return result as z.infer<O>;
  }

  /**
   * NOTE: aligned with dspy [x]
   */
  format_field_with_value(
    fields: z.ZodRawShape,
    values: Record<string, any>
  ): string {
    return Object.entries(fields)
      .map(([name, type]) => {
        const value = values ? values[name] : `[ ${name} ]`;
        return `[[ ## ${name} ## ]]\n${format_field_value(
          type as z.ZodType,
          value
        )}`;
      })
      .join("\n\n");
  }
  /**
   * NOTE: aligned with dspy [x]
   */
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

function type_info(type: z.ZodType): string {
  if (!(type instanceof z.ZodString)) {
    return ` (must be formatted as a valid ${get_annotation_name(type)})`;
  }
  return "";
}

export function sameKeys(
  a: Record<PropertyKey, unknown>,
  b: Record<PropertyKey, unknown>
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) return false;

  const bKeySet = new Set(bKeys);
  for (const k of aKeys) {
    if (!bKeySet.has(k)) return false;
  }
  return true;
}
