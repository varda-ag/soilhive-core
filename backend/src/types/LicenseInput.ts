import { License } from '../interfaces/License';

// syste fields: not provided by users
type SystemManagedFields = 'id' | 'slug' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by';

export type CreateLicenseInput = {
  name: string;
} & Partial<Omit<License, SystemManagedFields>>;

export type UpdateLicenseInput = Partial<Omit<License, SystemManagedFields>>;
