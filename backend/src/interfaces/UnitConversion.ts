import { UnitConversionType } from '../types/data';

export interface UnitConversion {
  id: string;
  slug: string;
  property_id: string;
  original_unit_of_measurement?: string;
  conversion_formula?: string;
  type: UnitConversionType;
  metadata?: object | null;
}
