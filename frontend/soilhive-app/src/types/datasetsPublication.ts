import type { IngestionStatus } from './backend';

export type DatasetsPublicationListItem = {
  id: string;
  name: string;
  status: IngestionStatus;
  visibility?: string;
};
