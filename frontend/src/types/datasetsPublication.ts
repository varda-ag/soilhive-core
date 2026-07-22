import type { CellDeleteReason, CellModifyReason, GISDataType, IngestionStatus, RowDeleteReason } from './backend';

export type DatasetsPublicationListItem = {
  id: string;
  name: string;
  status: IngestionStatus;
  updated_at: Date | null;
  updated_by?: string | null;
  visibility?: string;
  gis_datatype?: GISDataType | null;
  hasErrors?: boolean;
};

export type SoilDataSummary = {
  summary: { values_modified: number; rows_deleted: number; cells_deleted: number };
  modifications: Record<CellModifyReason, number>;
  row_deletions: Record<RowDeleteReason, number>;
  cell_deletions: Record<CellDeleteReason, number>;
};
