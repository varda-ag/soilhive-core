import { VocabularyType } from '../types/data';

export interface Vocabulary {
  slug: string;
  id: string;
  category: VocabularyType;
  name: string;
  created_at: Date;
  updated_at: Date | null;
}
