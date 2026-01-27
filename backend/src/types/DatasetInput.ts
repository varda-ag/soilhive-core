import { Dataset } from '../interfaces/Dataset';

// syste fields: not provided by users
type SystemManagedFields = 'id' | 'slug' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by';

export type CreateDatasetInput = {
  name: string;
} & Partial<Omit<Dataset, SystemManagedFields>>;

export type UpdateDatasetInput = Partial<Omit<Dataset, SystemManagedFields>>;
