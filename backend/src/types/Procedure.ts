import { ProcedureTechnique } from './data';

export type ProcedureObject = {
  id: string;
  sample_pretreatment?: string;
  technique?: ProcedureTechnique;
  laboratory_method?: string;
  extractant_concentration?: string;
  extraction_ratio?: string;
  extraction_base?: string;
  measurement_procedure?: string;
  limit_of_detection?: string;
};
