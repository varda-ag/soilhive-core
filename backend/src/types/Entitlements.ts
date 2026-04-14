export enum Capability {
  PREVIEW = 'preview',
  DOWNLOAD = 'download',
  OBFUSCATE_AS_POINTS = 'obfuscate_as_points',
  OBFUSCATE_AS_POLYGONS = 'obfuscate_as_polygons',
}

export type Entitlements = Record<string, Capability[]>; // key is slug, value is list of capabilities

export const EVERYONE: string = 'everyone';
