export const GISDataType = {
  POINT: "point",
  POLYGONAL: "polygonal",
  RASTER: "raster",
} as const;

export type GISDataTypeType = (typeof GISDataType)[keyof typeof GISDataType];

export const IngestionStatus = {
  PENDING: "PENDING",
  ONGOING: "ONGOING",
  INGESTED: "INGESTED",
  RELEASED: "RELEASED",
} as const;

export type IngestionStatusType = (typeof IngestionStatus)[keyof typeof IngestionStatus];