import { Output } from "ai";
import { Adapter } from "./base";
import type { Signature } from "../signatures/signature";
import { LM } from "../clients/lm";

/**
 * JSONAdapter is a simple adapter that uses the AI SDK's structured output
 * capabilities (via the `output` parameter in generateText/streamText).
 *
 * It formats the inputs as a JSON string and expects a structured JSON response
 * matching the signature's output schema.
 */
export class JSONAdapter extends Adapter {
  /**
   * Helper to ensure the output is an AI SDK Output spec.
   */
  private getOutputSpec(output: any): any {
    if (output && typeof output.parseCompleteOutput === "function") {
      return output;
    }
    // If it's not already an Output spec, we assume it's a Zod schema
    // and wrap it in Output.object.
    return Output.object({ schema: output });
  }

  async run<I, O>(
    lm: LM,
    signature: Signature<I, O>,
    inputs: I,
    options?: any
  ): Promise<O> {
    const output = this.getOutputSpec(signature.output);

    const result = (await lm.generateText({
      prompt: JSON.stringify(inputs, null, 2),
      system: signature.instructions,
      output,
      ...options,
    })) as any;

    return result.object as O;
  }

  async stream<I, O>(
    lm: LM,
    signature: Signature<I, O>,
    inputs: I,
    options?: any
  ): Promise<any> {
    const output = this.getOutputSpec(signature.output);

    return await lm.streamText({
      prompt: JSON.stringify(inputs, null, 2),
      system: signature.instructions,
      output,
      ...options,
    });
  }
}
