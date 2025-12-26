import type { Signature } from "../signatures/signature";
import { LM } from "../clients/lm";

/**
 * Base Adapter class.
 *
 * The Adapter serves as the interface layer between signatures and Language Models (LMs).
 * It handles the transformation from inputs to LM calls and back to structured outputs.
 *
 * In ds.ts, the adapter takes on the extra responsibility of calling the LM itself
 * to provide maximum flexibility in how the model is invoked and how the response
 * is processed.
 */
export abstract class Adapter {
  /**
   * Executes the adapter: formats inputs, calls the LM, and returns the parsed output.
   */
  abstract run<I, O>(
    lm: LM,
    signature: Signature<I, O>,
    inputs: I,
    options?: any
  ): Promise<O>;

  /**
   * Streams the adapter output from the LM.
   */
  abstract stream<I, O>(
    lm: LM,
    signature: Signature<I, O>,
    inputs: I,
    options?: any
  ): Promise<any>;
}
