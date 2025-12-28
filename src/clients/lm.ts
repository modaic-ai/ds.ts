import {
  generateText,
  streamText,
  type LanguageModel,
  type GenerateTextResult,
  type StreamTextResult,
  type ToolSet,
} from "ai";
import type { ProviderOptions } from "@ai-sdk/provider-utils";

/**
 * LM represents a language model configuration in ds.ts.
 * It encapsulates the Vercel AI SDK model and provider options.
 */
export class LM {
  constructor(
    public model: LanguageModel,
    public providerOptions?: ProviderOptions
  ) {}

  /**
   * Returns a copy of the LM with updated options.
   * Useful for temporary parameter overrides, similar to dspy.LM.copy().
   */
  copy(overrides: Partial<Pick<LM, "providerOptions">> = {}): LM {
    return new LM(this.model, {
      ...this.providerOptions,
      ...overrides.providerOptions,
    });
  }

  /**
   * Generates text using the language model.
   * Supports structured output via the `output` parameter.
   */
  async generateText<T extends ToolSet>(
    options: Omit<
      Parameters<typeof generateText>[0],
      "model" | "providerOptions"
    >
  ): Promise<GenerateTextResult<T, any>> {
    return (await generateText({
      model: this.model,
      providerOptions: this.providerOptions,
      ...options,
    } as any)) as any;
  }

  /**
   * Streams text using the language model.
   */
  async streamText<T extends ToolSet>(
    options: Omit<Parameters<typeof streamText>[0], "model" | "providerOptions">
  ): Promise<StreamTextResult<T, any>> {
    return (await streamText({
      model: this.model,
      providerOptions: this.providerOptions,
      ...options,
    } as any)) as any;
  }
}
