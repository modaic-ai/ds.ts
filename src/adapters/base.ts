import { z } from "zod";
import type { StreamTextResult, ToolSet, Output, GenerateTextResult } from "ai";
import type { Signature } from "../signatures/signature";
import { LM } from "../clients/lm";
import { split_message_content_for_custom_types } from "./types";
import { AdapterParseError } from "../exceptions";

/**
 * Base Adapter class.
 *
 * The Adapter serves as the interface layer between signatures and Language Models (LMs).
 * It handles the transformation from inputs to LM calls and back to structured outputs.
 */
export abstract class Adapter {
  /**
   * Execute the adapter pipeline: format inputs, call LM, and parse outputs.
   *
   * @param lm - The Language Model instance to use for generation. Must be an instance of `dspy.BaseLM`.
   * @param lm_kwargs - Additional keyword arguments to pass to the LM call (e.g., temperature, max_tokens). These are passed directly to the LM.
   * @param signature - The DSPy signature associated with this LM call.
   * @param demos - List of few-shot examples to include in the prompt. Each dictionary should contain keys matching the signature's input and output field names. Examples are formatted as user/assistant message pairs.
   * @param inputs - The current input values for this call. Keys must match the signature's input field names.
   *
   * @returns List of dictionaries representing parsed LM responses. Each dictionary contains keys matching the signature's output field names. For multiple generations (n > 1), returns multiple dictionaries.
   */
  async run<
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
    // TODO: return vercel AI SDK native response type
    const messages = this.format(signature, demos, inputs);
    const result = await lm.generateText({
      messages,
      tools: signature.tools,
      ...lm_kwargs,
    });

    // return native AI SDK response type with the output field replaced with adapter's structured output
    const parsed = this.parse(signature, result.text);
    return new Proxy(result, {
      get(target, prop, receiver) {
        if (prop === "output") {
          return parsed;
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as any;
  }

  /**
   * Stream the adapter pipeline: format inputs, call LM, and parse outputs.
   *
   * @param lm - The Language Model instance to use for generation. Must be an instance of `dspy.BaseLM`.
   * @param lm_kwargs - Additional keyword arguments to pass to the LM call (e.g., temperature, max_tokens). These are passed directly to the LM.
   * @param signature - The DSPy signature associated with this LM call.
   * @param demos - List of few-shot examples to include in the prompt. Each dictionary should contain keys matching the signature's input and output field names. Examples are formatted as user/assistant message pairs.
   * @param inputs - The current input values for this call. Keys must match the signature's input field names.
   *
   * @returns List of dictionaries representing parsed LM responses. Each dictionary contains keys matching the signature's output field names. For multiple generations (n > 1), returns multiple dictionaries.
   */
  async stream<
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
    const messages = this.format(signature, demos, inputs);
    const result = await lm.streamText({
      messages,
      tools: signature.tools,
      ...lm_kwargs,
    });

    const self = this;
    const generator = (async function* () {
      let accumulatedText = "";
      for await (const delta of result.textStream) {
        accumulatedText += delta;
        yield self.parse(signature, accumulatedText, true);
      }
    })();

    // Create a ReadableStream from the generator to be fully compatible with Vercel AI SDK's AsyncIterableStream
    const readableStream = new ReadableStream({
      async start(controller) {
        for await (const value of generator) {
          controller.enqueue(value);
        }
        controller.close();
      },
    });

    // Make it also an AsyncIterable so it satisfies the AsyncIterableStream type
    const partialOutputStream = Object.assign(readableStream, {
      [Symbol.asyncIterator]: () => generator[Symbol.asyncIterator](),
    });

    // return native AI SDK response type with the partialOutputStream field replaced with adapter's structured output stream
    return new Proxy(result, {
      get(target, prop, receiver) {
        if (prop === "partialOutputStream") {
          return partialOutputStream;
        }
        return Reflect.get(target, prop, receiver);
      },
    }) as any;
  }

  /**
   * Format the input messages for the LM call.
   *
   * This method converts the DSPy structured input along with few-shot examples and conversation history into
   * multiturn messages as expected by the LM. For custom adapters, this method can be overridden to customize
   * the formatting of the input messages.
   *
   * In general, we recommend the messages to have the following structure:
   * ```
   * [
   *   { "role": "system", "content": system_message },
   *   // Begin few-shot examples
   *   { "role": "user", "content": few_shot_example_1_input },
   *   { "role": "assistant", "content": few_shot_example_1_output },
   *   { "role": "user", "content": few_shot_example_2_input },
   *   { "role": "assistant", "content": few_shot_example_2_output },
   *   ...
   *   // End few-shot examples
   *   // Begin conversation history
   *   { "role": "user", "content": conversation_history_1_input },
   *   { "role": "assistant", "content": conversation_history_1_output },
   *   { "role": "user", "content": conversation_history_2_input },
   *   { "role": "assistant", "content": conversation_history_2_output },
   *   ...
   *   // End conversation history
   *   { "role": "user", "content": current_input }
   * ]
   * ```
   *
   * The system message should contain the field description, field structure, and task description.
   *
   * @param signature The DSPy signature for which to format the input messages.
   * @param demos A list of few-shot examples.
   * @param inputs The input arguments to the DSPy module.
   * @returns A list of multiturn messages as expected by the LM.
   */
  format<I extends z.ZodObject<any>, O extends z.ZodObject<any>>(
    signature: Signature<I, O>,
    demos: any[],
    inputs: z.infer<I>
  ): { role: "system" | "user" | "assistant"; content: string }[] {
    // NOTE: aligned with dspy [x]
    const context: Record<string, { type: z.ZodType; value: any }> = {}; // A mapping of keys to special types populated, used, and shared by helper functions.

    const inputsCopy = { ...inputs };
    const historyFieldName = this._get_history_field_name(signature);
    let conversationHistory: {
      role: "user" | "assistant";
      content: string;
    }[] = [];

    if (historyFieldName) {
      const signatureWithoutHistory = signature.delete(
        "input",
        historyFieldName
      );
      conversationHistory = this.format_conversation_history(
        signatureWithoutHistory,
        historyFieldName,
        inputsCopy,
        context
      );
    }

    let messages: {
      role: "system" | "user" | "assistant";
      content: string;
    }[] = [];

    const systemMessage = [
      this.format_field_description(signature),
      this.format_field_structure(signature),
      this.format_task_description(signature),
    ]
      .filter(Boolean)
      .join("\n");

    messages.push({ role: "system", content: systemMessage });

    messages.push(...this.format_demos(signature, demos, context));

    if (historyFieldName) {
      const signatureWithoutHistory = signature.delete(
        "input",
        historyFieldName
      );
      const content = this.format_user_message_content(
        signatureWithoutHistory,
        inputsCopy,
        context,
        {
          main_request: true,
        }
      );
      messages.push(...conversationHistory);
      messages.push({ role: "user", content });
    } else {
      const content = this.format_user_message_content(
        signature,
        inputsCopy,
        context,
        {
          main_request: true,
        }
      );
      messages.push({ role: "user", content });
    }
    messages = split_message_content_for_custom_types(messages, context);

    return messages;
  }

  /**
   * Format the field description for the system message.
   *
   * This method formats the field description for the system message. It should return a string that contains
   * the field description for the input fields and the output fields.
   *
   * @param signature - The DSPy signature for which to format the field description.
   * @returns A string that contains the field description for the input fields and the output fields.
   */
  format_field_description<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(signature: Signature<I, O>): string {
    // NOTE: Must be implemented by the subclass
    throw new Error("Not implemented");
  }

  /**
   * Format the field structure for the system message.
   *
   * This method formats the field structure for the system message. It should return a string that dictates
   * the format the input fields should be provided to the LM, and the format the output fields will be in the response.
   * Refer to the ChatAdapter and JsonAdapter for an example.
   *
   * @param signature - The DSPy signature for which to format the field structure.
   * @returns A string that contains the field structure format.
   */
  format_field_structure<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(signature: Signature<I, O>): string {
    // NOTE: Must be implemented by the subclass
    throw new Error("Not implemented");
  }

  /**
   * Format the task description for the system message.
   *
   * This method formats the task description for the system message. In most cases, this is just a thin wrapper
   * over `signature.instructions`.
   *
   * @param signature - The DSPy signature of the DSpy module.
   * @returns A string that describes the task.
   */
  format_task_description<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(signature: Signature<I, O>): string {
    // NOTE: Must be implemented by the subclass
    throw new Error("Not implemented");
  }

  /**
   * Format the user message content.
   *
   * This method formats the user message content, which can be used in formatting few-shot examples,
   * conversation history, and the current input.
   *
   * @param signature - The DSPy signature for which to format the user message content.
   * @param inputs - The input arguments to the DSPy module.
   * @param options.prefix - A prefix to the user message content.
   * @param options.suffix - A suffix to the user message content.
   * @returns A string that contains the user message content.
   */
  format_user_message_content<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(
    signature: Signature<I, O>,
    inputs: z.infer<I>,
    context: Record<string, { type: z.ZodType; value: any }>,
    options?: { prefix?: string; suffix?: string; main_request?: boolean }
  ): string {
    // NOTE: Must be implemented by the subclass
    throw new Error("Not implemented");
  }

  /**
   * Format the assistant message content.
   *
   * This method formats the assistant message content, which can be used in formatting few-shot examples
   * and conversation history.
   *
   * @param signature - The DSPy signature for which to format the assistant message content.
   * @param outputs - The output fields to be formatted.
   * @param options - Options for formatting, including a message to be used when a field is missing.
   * @returns A string that contains the assistant message content.
   */
  format_assistant_message_content<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(
    signature: Signature<I, O>,
    outputs: z.infer<O>,
    options?: { missing_field_message?: string }
  ): string {
    // NOTE: Must be implemented by the subclass
    throw new Error("Not implemented");
  }

  /**
   * Format the few-shot examples.
   *
   * This method formats the few-shot examples as multiturn messages.
   *
   * @param signature - The DSPy signature for which to format the few-shot examples.
   * @param demos - A list of few-shot examples, each element is a dictionary with keys of the input and output fields of the signature.
   * @returns A list of multiturn messages.
   */
  format_demos<I extends z.ZodObject<any>, O extends z.ZodObject<any>>(
    signature: Signature<I, O>,
    demos: any[],
    context: Record<string, { type: z.ZodType; value: any }>
  ): { role: "user" | "assistant"; content: string }[] {
    // NOTE: aligned with dspy [x]
    const complete_demos = [];
    const incomplete_demos = [];

    for (const demo of demos) {
      // Check if all fields are present and not None
      const is_complete = Object.keys(signature.input.shape).every(
        (key) => demo[key] !== undefined && demo[key] !== null
      );
      const has_input = Object.keys(signature.input.shape).some(
        (key) => demo[key] !== undefined
      );
      const has_output = Object.keys(signature.output.shape).some(
        (key) => demo[key] !== undefined
      );

      if (is_complete) {
        complete_demos.push(demo);
      } else if (has_input && has_output) {
        // We only keep incomplete demos that have at least one input and one output field
        incomplete_demos.push(demo);
      }
    }

    const messages: { role: "user" | "assistant"; content: string }[] = [];

    const incomplete_demo_prefix =
      "This is an example of the task, though some input or output fields are not supplied.";
    for (const demo of incomplete_demos) {
      messages.push({
        role: "user",
        content: this.format_user_message_content(signature, demo, context, {
          prefix: incomplete_demo_prefix,
        }),
      });
      messages.push({
        role: "assistant",
        content: this.format_assistant_message_content(signature, demo, {
          missing_field_message: "Not supplied for this particular example. ",
        }),
      });
    }

    for (const demo of complete_demos) {
      messages.push({
        role: "user",
        content: this.format_user_message_content(signature, demo, context),
      });
      messages.push({
        role: "assistant",
        content: this.format_assistant_message_content(signature, demo, {
          missing_field_message:
            "Not supplied for this conversation history message. ",
        }),
      });
    }

    return messages;
  }

  /**
   * Finds the name of the history field in a signature's input schema.
   */
  _get_history_field_name<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(signature: Signature<I, O>): string | undefined {
    // NOTE: aligned with dspy [x]
    for (const [name, field] of Object.entries(signature.input.shape)) {
      if ((field as z.ZodType).meta()?.history === true) {
        return name;
      }
    }
    return undefined;
  }

  /**
   * Format the conversation history.
   *
   * This method formats the conversation history and the current input as multiturn messages.
   *
   * @param signature - The DSPy signature for which to format the conversation history.
   * @param historyFieldName - The name of the history field in the signature.
   * @param inputs - The input arguments to the DSPy module.
   * @param context - A mapping of keys to special types
   * @returns A list of multiturn messages.
   */
  format_conversation_history<
    I extends z.ZodObject<any>,
    O extends z.ZodObject<any>
  >(
    signature: Signature<I, O>,
    historyFieldName: string,
    inputs: any,
    context: Record<string, { type: z.ZodType; value: any }>
  ): { role: "user" | "assistant"; content: string }[] {
    // NOTE: aligned with dspy [x]
    const history = inputs[historyFieldName];

    if (!history || !Array.isArray(history)) {
      return [];
    }

    const messages: { role: "user" | "assistant"; content: string }[] = [];

    for (const msg of history) {
      messages.push({
        role: "user",
        content: this.format_user_message_content(signature, msg, context),
      });
      messages.push({
        role: "assistant",
        content: this.format_assistant_message_content(signature, msg, context),
      });
    }

    delete inputs[historyFieldName];

    return messages;
  }

  /**
   * Parse the LM output into a dictionary of the output fields.
   *
   * This method parses the LM output into a dictionary of the output fields.
   *
   * @param signature - The DSPy signature for which to parse the LM output.
   * @param completion - The LM output to be parsed.
   * @returns A dictionary of the output fields.
   */
  parse<I extends z.ZodObject<any>, O extends z.ZodObject<any>>(
    signature: Signature<I, O>,
    completion: string,
    allow_partial_output: boolean = false
  ): z.infer<O> {
    // NOTE: Must be implemented by the subclass
    throw new Error("Not implemented");
  }
}
