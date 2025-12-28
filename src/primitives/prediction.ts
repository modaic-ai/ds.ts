import { Signature, type InferOutput } from "../signatures/signature";
import { z } from "zod";
import type { GenerateTextResult, StreamTextResult } from "ai";

/**
 * Internal class implementation.
 */
class _Prediction<
  R = GenerateTextResult<any, any> | StreamTextResult<any, any>
> {
  _result: R | null;

  constructor(data: any, result?: R) {
    Object.assign(this, data);
    this._result = result ?? null;
  }
}

/**
 * A Prediction is the intersection of the output fields (O) and the Prediction metadata.
 */
export type Prediction<
  O extends Record<string, any> = Record<string, any>,
  R = GenerateTextResult<any, any> | StreamTextResult<any, any> | null
> = O & { _result: R };

/**
 * The Prediction class.
 * Overloads ensure that if a result is provided, it is not marked as optional on the instance,
 * and if it is omitted, it is explicitly typed as null.
 */
export const Prediction = _Prediction as unknown as {
  /**
   * Create a Prediction with an explicitly provided result.
   */
  new <O extends Record<string, any>, R>(data: O, result: R): O & {
    _result: R;
  };

  /**
   * Create a Prediction where the result is explicitly omitted.
   */
  new <O extends Record<string, any>>(data: O): O & { _result: null };

  /**
   * Fallback for general usage.
   */
  new <
    O extends Record<string, any>,
    R = GenerateTextResult<any, any> | StreamTextResult<any, any>
  >(
    data: O,
    result?: R
  ): Prediction<O, R | null>;
};
