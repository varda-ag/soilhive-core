import { Request, Response } from 'express';
import DaiService from '../services/DaiService';
import { parseBboxString } from '../utils/geometry';

const daiService = new DaiService();

export const getDai = async (req: Request, res: Response): Promise<void> => {
  const { bbox: bboxString, resolution } = req.query;
  const bbox = parseBboxString(bboxString! as string);
  const dai = await daiService.getDai(bbox, Number(resolution!));
  res.json(dai);
};
