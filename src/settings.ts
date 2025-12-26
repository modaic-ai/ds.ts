import type { LM } from "./clients/lm";

/**
 * Global settings for ds.ts, matching dspy.settings.
 */
export interface Settings {
  lm: LM | null;
}

export const settings: Settings = {
  lm: null,
};

/**
 * Global configuration helper, matching dspy.configure().
 */
export const configure = (config: Partial<Settings>) => {
  if (config.lm !== undefined) {
    settings.lm = config.lm;
  }
};
