import { ProcedureVocabularyType } from '../types/data';

export interface ProcedureVocabulary {
  slug: string;
  id: string;
  category: ProcedureVocabularyType;
  name: string;
  created_at: Date;
  updated_at: Date | null;
}
