import { Capability } from './enums';

/** Namespaced by scope: keys are slugs (`datasets`) or freeform config keys (`configs`); values are capability lists. */
export type Entitlements = {
  datasets: Record<string, Capability[]>;
  configs: Record<string, Capability[]>;
};
