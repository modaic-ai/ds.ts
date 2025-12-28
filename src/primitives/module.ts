import { AsyncLocalStorage } from "node:async_hooks";
import type { Prediction } from "./prediction";
import type {
  Signature,
  InferInput,
  InferOutput,
} from "../signatures/signature";
import type { Predict } from "../predict/predict";

type DSTsTrace = {
  module: string;
  example: any;
  prediction: Prediction<any, any>;
}[];

export const traceStorage = new AsyncLocalStorage<DSTsTrace>();

export abstract class Module<S extends Signature = Signature> {
  public traces: DSTsTrace = [];
  public demos: any[] = [];

  constructor() {}

  abstract forward(
    input: InferInput<S>
  ): Promise<Prediction<InferOutput<S>, any>>;

  async run(input: InferInput<S>): Promise<Prediction<InferOutput<S>, any>> {
    const currentRunTrace: DSTsTrace = [];

    const prediction = await traceStorage.run(currentRunTrace, async () => {
      return await this.forward(input);
    });

    // Collect all traces from this run (children pushed to currentRunTrace)
    this.traces.push(...currentRunTrace);
    this.traces.push({
      module: this.constructor.name,
      example: input,
      prediction,
    });

    // Propagate to parent if exists
    const parentTrace = traceStorage.getStore();
    if (parentTrace) {
      parentTrace.push(...this.traces);
    }

    return prediction;
  }

  /**
   * Returns a list of all predictors in the module.
   * (recursive)
   */
  named_predictors(): { name: string; predictor: Predict<any> }[] {
    const result: { name: string; predictor: Predict<any> }[] = [];

    for (const { name, sub_module } of this.named_sub_modules()) {
      if (isPredictObject(sub_module)) {
        result.push({
          name: name,
          predictor: sub_module as Predict<any>,
        });
      }
    }

    return result;
  }

  /**
   * Returns a list of all submodules in the module.
   * (recursive)
   */
  named_sub_modules(): { name: string; sub_module: Module<any> }[] {
    return this._named_sub_modules();
  }

  _named_sub_modules(
    prefix?: string
  ): { name: string; sub_module: Module<any> }[] {
    const currentPrefix = prefix ? `${prefix}.` : "";
    const result: { name: string; sub_module: Module<any> }[] = [];

    for (const [key, value] of Object.entries(this)) {
      if (key === "traces" || key === "demos") continue;

      const name = `${currentPrefix}${key}`;

      if (value instanceof Module) {
        result.push({
          name,
          sub_module: value as Module<any>,
        });
        if (!isPredictObject(value)) {
          result.push(...value._named_sub_modules(name));
        }
      } else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const item = value[i];
          const itemName = `${name}[${i}]`;
          if (item instanceof Module) {
            result.push({
              name: itemName,
              sub_module: item as Module<any>,
            });
            if (!isPredictObject(item)) {
              result.push(...item._named_sub_modules(itemName));
            }
          }
        }
      } else if (
        typeof value === "object" &&
        value !== null &&
        value.constructor === Object
      ) {
        for (const [subKey, subValue] of Object.entries(value)) {
          const subName = `${name}.${subKey}`;
          if (subValue instanceof Module) {
            result.push({
              name: subName,
              sub_module: subValue as Module<any>,
            });
            if (!isPredictObject(subValue)) {
              result.push(...subValue._named_sub_modules(subName));
            }
          }
        }
      }
    }

    return result;
  }

  dump_state() {
    const state: Record<string, any> = {};
    for (const { name, predictor } of this.named_predictors()) {
      state[name] = predictor.dump_state();
    }
    return state;
  }

  load_state(state: Record<string, any>): void {
    for (const { name, predictor } of this.named_predictors()) {
      predictor.load_state(state[name]);
    }
  }

  async save(path: string): Promise<void> {
    await Bun.write(path, JSON.stringify(this.dump_state(), null, 2));
  }

  async load(path: string): Promise<void> {
    const state = await Bun.file(path).json();
    this.load_state(state);
  }
}

function isPredictObject(value: unknown): value is { isPredict: true } {
  return (
    typeof value === "object" &&
    value !== null &&
    "isPredict" in value &&
    (value as any).isPredict === true
  );
}
