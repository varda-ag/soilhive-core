import { ProcedureTechnique } from '../types/data';

export interface Procedure {
    id: string;
    slug: string;
    sample_pretreatment?: string;
    technique?: ProcedureTechnique;
    extractant_formulation?: string;
    extractant_concentration?: string;
    extraction_ratio?: string;
    extraction_base?: string;
    instrument?: string;
    limit_of_detection?: string;
  }
