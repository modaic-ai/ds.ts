import type { LM } from "./clients/lm";
import type { Adapter } from "./adapters/base";

/**
 * Global settings for ds.ts, matching dspy.settings.
 */
export interface Settings {
  lm: LM | null;
  adapter: Adapter | null;
}

export const settings: Settings = {
  lm: null,
  adapter: null,
};

/**
 * Global configuration helper, matching dspy.configure().
 */
export const configure = (config: Partial<Settings>) => {
  if (config.lm !== undefined) {
    settings.lm = config.lm;
  }
  if (config.adapter !== undefined) {
    settings.adapter = config.adapter;
  }
};
