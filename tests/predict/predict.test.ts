import { describe, expect, test, beforeEach } from "bun:test";
import { Predict } from "../../src/predict/predict";
import { Signature } from "../../src/signatures/signature";
import { configure } from "../../src/settings";
import { MockLM } from "../test_utils";
import { JSONAdapter } from "../../src/adapters/json_adapter";
import { z } from "zod";

describe("Predict", () => {
  beforeEach(() => {
    configure({
      lm: new MockLM(),
      adapter: new JSONAdapter(),
    });
  });

  test("initialization with string signature", () => {
    const predict = new Predict("question -> answer");
    expect(predict.signature).toBeInstanceOf(Signature);
    expect(predict.signature.instructions).toBe(
      "Given the fields `question`, produce the fields `answer`."
    );
    expect(predict.isPredict).toBe(true);
  });

  test("initialization with Signature object", () => {
    const sig = new Signature({
      input: z.object({ question: z.string() }),
      output: z.object({ answer: z.string() }),
    });
    const predict = new Predict(sig);
    expect(predict.signature).toBe(sig);
  });

  test("forward execution with MockLM", async () => {
    const predict = new Predict("question -> answer");
    const result = await predict.forward({
      question: "What is the capital of France?",
    });

    expect(result.answer).toBe("dummy");
    expect(result).toHaveProperty("_result");
  });

  test("run execution with tracing", async () => {
    const predict = new Predict("question -> answer");
    const result = await predict.run({
      question: "What is the capital of France?",
    });

    expect(result.answer).toBe("dummy");
    expect(predict.traces.length).toBe(1);
    expect(predict.traces[0]?.module).toBe("Predict");
    expect(predict.traces[0]?.example).toEqual({
      question: "What is the capital of France?",
    });
  });

  test("setLM updates the local LM", () => {
    const predict = new Predict("question -> answer");
    const customLM = new MockLM();
    predict.setLM(customLM);
    expect(predict.lm).toBe(customLM);
  });

  test("dump_state and load_state delegates to signature", () => {
    const predict = new Predict("question -> answer");
    const sig = predict.signature;

    const newInstructions = "Answer very briefly.";
    predict.signature = sig.withInstructions(newInstructions);

    const state = predict.dump_state();
    expect(state.instructions).toBe(newInstructions);

    const predict2 = new Predict("question -> answer");
    expect(predict2.signature.instructions).not.toBe(newInstructions);

    predict2.load_state(state);

    // As noted, this might fail if Predict.load_state doesn't re-assign this.signature
    expect(predict2.signature.instructions).toBe(newInstructions);
  });
});
