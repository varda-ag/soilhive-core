import { ActionCapability } from './enums';

export type Entitlements = Record<string, ActionCapability[]>; // key is slug, value is list of capabilities
