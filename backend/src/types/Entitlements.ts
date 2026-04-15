import { Capability } from './enums';

export type Entitlements = Record<string, Capability[]>; // key is slug, value is list of capabilities
