import { ProcedureTechnique } from '../types/data';

export interface Procedure {
  id: string;
  slug: string;
  sample_pretreatment_id?: string;
  technique?: ProcedureTechnique;
  laboratory_method_id?: string;
  extractant_concentration_id?: string;
  extraction_ratio_id?: string;
  extraction_base_id?: string;
  measurement_procedure_id?: string;
  limit_of_detection_id?: string;
}
