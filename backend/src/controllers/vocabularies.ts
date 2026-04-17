import { Request, Response } from 'express';
import StatusCodes from 'http-status-codes';
import VocabularyService from '../services/VocabularyService';
import { CreateVocabularyInput } from '../types/VocabularyInput';
import { getNewPath, idToSlug } from '../utils/slugs';

const vocabularyService = new VocabularyService();

export const getVocabulary = async (req: Request, res: Response) => {
  const data = await vocabularyService.getVocabulary(req.customData);
  res.json(idToSlug(data));
};

export const getVocabularyItem = async (req: Request, res: Response) => {
  const oldId = req.params['vocabularyId']!;
  const data = await vocabularyService.getVocabularyItem(req.customData, oldId);

  if (data.slug !== oldId) {
    const newPath = getNewPath(req.path, oldId, data.slug);
    res.redirect(StatusCodes.MOVED_PERMANENTLY, newPath);
    return;
  }

  res.json(idToSlug(data));
};

export const createVocabulary = async (req: Request, res: Response) => {
  const input: CreateVocabularyInput = req.body;
  const data = await vocabularyService.createVocabulary(req.customData, input);
  res.status(StatusCodes.CREATED).json(idToSlug(data));
};

