import { Module } from "../primitives/module";
import { Prediction } from "../primitives/prediction";
import type {
  //   Signature,
  InferInput,
  InferOutput,
  InferTools,
} from "../signatures/signature";
import { settings } from "../settings";
import type { LM } from "../clients/lm";
import { ChatAdapter } from "../adapters/chat_adapter";
import type { Adapter } from "../adapters/base";
import { Signature } from "../signatures/signature";
import { z } from "zod";
import type { GenerateTextResult, Output, ToolSet } from "ai";

export class Predict<S extends Signature = Signature> extends Module<S> {
  public signature: S | Signature;
  public lm: LM | null;
  public adapter: Adapter;
  public isPredict: true;

  constructor(signature: S | string) {
    super();
    if (typeof signature === "string") {
      this.signature = Signature.parse(signature);
    } else {
      this.signature = signature;
    }
    this.lm = settings.lm;
    this.adapter = settings.adapter ?? new ChatAdapter();
    this.isPredict = true;
  }

  override async run(
    input: InferInput<S>
  ): Promise<
    Prediction<
      InferOutput<S>,
      GenerateTextResult<InferTools<S>, Output.Output<InferOutput<S>>>
    >
  > {
    return super.run(input);
  }

  async forward(
    input: InferInput<S>
  ): Promise<
    Prediction<
      InferOutput<S>,
      GenerateTextResult<InferTools<S>, Output.Output<InferOutput<S>>>
    >
  > {
    if (!this.lm) {
      throw new Error("LM not set");
    }
    const result = await this.adapter.run(
      this.lm,
      {},
      this.signature,
      [],
      input
    );

    const output = result.output as InferOutput<S>;
    return new Prediction(output, result) as any;
  }

  setLM(lm: LM) {
    this.lm = lm;
  }

  override dump_state(): any {
    return this.signature.dump_state();
  }

  override load_state(state: any): void {
    this.signature = this.signature.load_state(state);
  }
}
