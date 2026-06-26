import type { IngestionStatus } from './backend';

export type DatasetsPublicationListItem = {
  id: string;
  name: string;
  status: IngestionStatus;
  updated_at: Date | null;
  updated_by?: string | null;
  visibility?: string;
  hasErrors?: boolean;
};
