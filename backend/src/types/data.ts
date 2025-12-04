export const GISDataType = {
  POINT: "point",
  POLYGONAL: "polygonal",
  RASTER: "raster",
} as const;

export type GISDataTypeType = (typeof GISDataType)[keyof typeof GISDataType];
