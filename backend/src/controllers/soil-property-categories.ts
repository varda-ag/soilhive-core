import { Request, Response } from 'express';
import { idToSlug } from '../utils/slugs';
import SoilPropertyCategoryService from '../services/SoilPropertyCategoryService';

const soilPropertyCategoryService = new SoilPropertyCategoryService();

export const getSoilPropertyCategories = async (req: Request, res: Response) => {
  const data = await soilPropertyCategoryService.getSoilPropertyCategories(req.customData);
  res.json(idToSlug(data));
};

export const getSoilPropertyCategory = async (req: Request, res: Response) => {
  const data = await soilPropertyCategoryService.getSoilPropertyCategory(req.customData, req.params['soilPropertyCategoryId']!);
  res.json(idToSlug(data));
};
