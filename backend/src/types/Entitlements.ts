export type Capability = 'preview' | 'download' | 'obfuscate_as_points' | 'obfuscate_as_polygons';

export type Entitlements = Record<string, Capability[]>; // key is slug, value is list of capabilities

export const EVERYONE: string = 'everyone';
