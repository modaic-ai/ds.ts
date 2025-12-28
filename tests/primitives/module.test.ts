import { describe, expect, test, beforeEach } from "bun:test";
import { Module } from "../../src/primitives/module";
import { Predict } from "../../src/predict/predict";
import { Prediction } from "../../src/primitives/prediction";
import { configure } from "../../src/settings";
import { MockLM } from "../test_utils";
import { JSONAdapter } from "../../src/adapters/json_adapter";

// Mock Module implementation for testing
class SimpleModule extends Module {
  public predict1 = new Predict("question -> query");
  public predict2 = new Predict("query -> answer");

  async forward(input: { question: string }): Promise<Prediction<any, any>> {
    const res1 = await this.predict1.run({ question: input.question });
    const res2 = await this.predict2.run({ query: res1.query });
    return res2;
  }
}

class NestedModule extends Module {
  public sub = new SimpleModule();

  async forward(input: { question: string }): Promise<Prediction<any, any>> {
    return await this.sub.run(input);
  }
}

describe("Module", () => {
  beforeEach(() => {
    configure({
      lm: new MockLM(),
      adapter: new JSONAdapter(),
    });
  });

  test("initialization", () => {
    const module = new SimpleModule();
    expect(module.traces).toEqual([]);
    expect(module.demos).toEqual([]);
  });

  test("named_predictors identifies all Predict instances", () => {
    const module = new SimpleModule();
    const namedPreds = module.named_predictors();
    expect(namedPreds.length).toBe(2);
    const names = namedPreds.map((p) => p.name);
    expect(names).toContain("predict1");
    expect(names).toContain("predict2");
    expect(namedPreds[0]!.predictor).toBeInstanceOf(Predict);
  });

  test("nested named_predictors identifies deep Predict instances", () => {
    const module = new NestedModule();
    const namedPreds = module.named_predictors();
    expect(namedPreds.length).toBe(2);
    const names = namedPreds.map((p) => p.name);
    expect(names).toContain("sub.predict1");
    expect(names).toContain("sub.predict2");
  });

  test("named_sub_modules identifies all submodules", () => {
    const module = new NestedModule();
    const namedSubs = module.named_sub_modules();
    const names = namedSubs.map((s) => s.name);
    expect(names).toContain("sub");
    expect(names).toContain("sub.predict1");
    expect(names).toContain("sub.predict2");
  });

  test("tracing behavior in a single run", async () => {
    // Instantiate module AFTER configure so predictors get the LM
    const module = new SimpleModule();
    const input = { question: "What is 1+1?" };
    await module.run(input);

    expect(module.traces.length).toBe(3);
    expect(module.traces[0]!.module).toBe("Predict");
    expect(module.traces[1]!.module).toBe("Predict");
    expect(module.traces[2]!.module).toBe("SimpleModule");
    expect(module.traces[2]!.example).toEqual(input);
  });

  test("tracing behavior with nested modules", async () => {
    const module = new NestedModule();
    const input = { question: "What is 2+2?" };
    await module.run(input);

    expect(module.traces.length).toBe(4);
    expect(module.traces[0]!.module).toBe("Predict");
    expect(module.traces[1]!.module).toBe("Predict");
    expect(module.traces[2]!.module).toBe("SimpleModule");
    expect(module.traces[3]!.module).toBe("NestedModule");
  });

  test("dump_state and load_state", () => {
    const module = new SimpleModule();

    const sig1 = module.predict1.signature;
    const newInstructions = "Custom instructions for predict1";
    module.predict1.signature = sig1.withInstructions(newInstructions);

    const state = module.dump_state();
    expect(state).toHaveProperty("predict1");
    expect(state).toHaveProperty("predict2");
    expect(state.predict1.instructions).toBe(newInstructions);

    const module2 = new SimpleModule();
    expect(module2.predict1.signature.instructions).not.toBe(newInstructions);

    module2.load_state(state);

    // Note: If Predict.load_state doesn't re-assign the signature, this might fail.
    // In src/predict/predict.ts:
    // override load_state(state: any): void { this.signature.load_state(state); }
    // In src/signatures/signature.ts:
    // load_state(state: any) { return new Signature(...); }
    // It DOES NOT mutate. This is a bug in the source code.
    // I will let the test fail if it's a bug, as requested.

    expect(module2.predict1.signature.instructions).toBe(newInstructions);
  });
});
