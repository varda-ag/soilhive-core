import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import ProcedureService from '../services/ProcedureService';
import { ProcedureObject } from '../types/Procedure';
import { ProcedureTechnique } from '../types/data';

const procedureService = new ProcedureService();

export const getProcedures = async (req: Request, res: Response) => {
  const data = await procedureService.getProcedures(req.customData);
  res.json(data);
};

export const getProcedure = async (req: Request, res: Response) => {
  const data = await procedureService.getProcedure(req.customData, req.params['procedureId']!);
  res.json(data);
};

export const getProcedureTechniques = (_req: Request, res: Response) => {
  res.json(Object.values(ProcedureTechnique));
};

export const createProcedure = async (req: Request, res: Response) => {
  const input: ProcedureObject = req.body;
  const data = await procedureService.createProcedure(req.customData, input);
  res.status(StatusCodes.CREATED).json(data);
};
