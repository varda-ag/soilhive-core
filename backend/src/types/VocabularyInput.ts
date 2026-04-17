import { Vocabulary } from '../interfaces/Vocabulary';

export type CreateVocabularyInput = Pick<Vocabulary, 'name' | 'category'>;
