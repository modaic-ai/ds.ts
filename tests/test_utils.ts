import { LM } from "../src/clients/lm";
import type { GenerateTextResult, StreamTextResult } from "ai";
import { z } from "zod";

/**
 * MockLM is a dummy language model for testing purposes.
 * It overrides generateText and streamText to return predictable results
 * without making actual API calls.
 */
export class MockLM extends LM {
  constructor() {
    // Pass a dummy LanguageModel implementation to the parent constructor
    super({
      specificationVersion: "v1",
      provider: "mock",
      modelId: "mock-model",
      doGenerate: async () => ({
        text: "This is a dummy lm call",
        finishReason: "stop",
        usage: { promptTokens: 0, completionTokens: 0 },
      }),
      doStream: async () =>
        ({
          stream: new ReadableStream(),
        } as any),
    } as any);
  }

  /**
   * Overrides generateText to return a dummy GenerateTextResult.
   * The response text is always "This is a dummy lm call".
   * The responseMessages includes the input messages plus the mock assistant response.
   */
  override async generateText(
    options: any
  ): Promise<GenerateTextResult<any, any>> {
    const inputMessages = this.getMessages(options);
    let assistantContent = "This is a dummy lm call";

    const responseMessages = [
      ...inputMessages,
      { role: "assistant", content: assistantContent },
    ];

    const result: any = {
      text: assistantContent,
      responseMessages,
      finishReason: "stop",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      rawResponse: { headers: {} },
      request: {},
      warnings: [],
    };

    if (options.output) {
      const dummy = this.generateDummyObject(options.output);
      result.output = dummy;
      // Also set text to a valid JSON for adapters that might parse text
      result.text = JSON.stringify(dummy);
      // Update assistant message content in responseMessages if text was updated
      responseMessages[responseMessages.length - 1].content = result.text;
    }

    return result;
  }

  /**
   * Overrides streamText to return a dummy StreamTextResult.
   */
  override async streamText(options: any): Promise<StreamTextResult<any, any>> {
    const inputMessages = this.getMessages(options);
    const assistantContent = "This is a dummy lm call";

    const responseMessages = [
      ...inputMessages,
      { role: "assistant", content: assistantContent },
    ];

    // Create a simple stream that just emits the dummy text
    const textStream = new ReadableStream({
      start(controller) {
        controller.enqueue(assistantContent);
        controller.close();
      },
    });

    const result: any = {
      textStream,
      fullText: assistantContent,
      responseMessages: Promise.resolve(responseMessages),
      finishReason: Promise.resolve("stop" as const),
      usage: Promise.resolve({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      }),
      warnings: [],
    };

    if (options.output) {
      // Stream results for structured output usually have an outputStream
      const dummyObject = this.generateDummyObject(options.output);
      result.outputStream = new ReadableStream({
        start(controller) {
          controller.enqueue(dummyObject);
          controller.close();
        },
      });
      result.outputPromise = Promise.resolve(dummyObject);
    }

    return result;
  }

  /**
   * Helper to extract messages from options (supports both messages and prompt).
   */
  private getMessages(options: any): any[] {
    if (options.messages) {
      return options.messages;
    }
    if (options.prompt) {
      return [{ role: "user", content: options.prompt }];
    }
    return [];
  }

  /**
   * Generates a dummy object based on the output schema.
   */
  private generateDummyObject(output: any): any {
    // The output option in AI SDK can be an Output object which has a schema
    const schema =
      output.schema ||
      output.output ||
      output.config?.schema ||
      output.responseFormat?.jsonSchema ||
      output.responseFormat?.schema ||
      output._def?.schema ||
      (output instanceof z.ZodType ? output : null);

    if (schema) {
      // Handle ZodObject or any object with a shape
      const shape =
        schema.shape ||
        (schema._def as any)?.shape() ||
        (schema._def as any)?.shape;
      if (shape) {
        const dummy: any = {};
        for (const key in shape) {
          const field = shape[key];
          if (field instanceof z.ZodNumber) {
            dummy[key] = 0;
          } else if (field instanceof z.ZodBoolean) {
            dummy[key] = false;
          } else if (field instanceof z.ZodArray) {
            dummy[key] = [];
          } else if (
            field instanceof z.ZodObject ||
            (field._def as any)?.typeName === "ZodObject"
          ) {
            dummy[key] = this.generateDummyObject({ schema: field });
          } else {
            dummy[key] = "dummy";
          }
        }
        return dummy;
      }
    }

    return {};
  }
}
