import { Request, Response } from 'express';
import StatusCodes from 'http-status-codes';
import DataRequestService from '../services/DataRequestService';

const dataRequestService = new DataRequestService();

export const postDataRequest = async (req: Request, res: Response) => {
  const data = await dataRequestService.createDataRequest(req.customData, req.body);
  res.status(StatusCodes.CREATED).json(data);
};

export const getDataRequestById = async (req: Request, res: Response) => {
  const data = await dataRequestService.getDataRequest(req.customData, req.params['dataRequestId'] as string);
  res.json(data);
};

export const deleteDataRequestById = async (req: Request, res: Response) => {
  await dataRequestService.deleteDataRequest(req.customData, req.params['dataRequestId'] as string);
  res.sendStatus(StatusCodes.NO_CONTENT);
};
