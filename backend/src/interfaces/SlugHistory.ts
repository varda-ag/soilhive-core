import { EntityType } from "../types/data";

export interface SlugHistory {
  slug: string,
  entity_id: string;
  entity_type: EntityType;
  created_at: Date;
  updated_at: Date | null;
}