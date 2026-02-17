import { ProcedureTechnique } from '../types/data';

export interface Procedure {
  id: string;
  slug: string;
  sample_pretreatment?: string;
  technique?: ProcedureTechnique;
  laboratory_method?: string;
  extractant_concentration?: string;
  extraction_ratio?: string;
  extraction_base?: string;
  measurement_procedure?: string;
  limit_of_detection?: string;
}
