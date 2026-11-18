import { Request, Response } from 'express';
import StatusCodes from 'http-status-codes';
import AccessRequestService from '../services/AccessRequestService';

const accessRequestService = new AccessRequestService();

export const createAccessRequest = async (req: Request, res: Response) => {
  res.status(StatusCodes.CREATED).json(await accessRequestService.createAccessRequest(req.customData, req.body));
};

export const getMyAccessRequests = async (req: Request, res: Response) => {
  res.json(await accessRequestService.listMine(req.customData));
};

export const getAccessRequests = async (req: Request, res: Response) => {
  const status = (req.query['status'] as 'pending' | 'all' | undefined) ?? 'pending';
  res.json(await accessRequestService.listForAdmins(req.customData, status));
};

export const decideAccessRequest = async (req: Request, res: Response) => {
  res.json(await accessRequestService.decide(req.customData, req.params['requestId']! as string, req.body.decisions));
};

export const withdrawAccessRequest = async (req: Request, res: Response) => {
  await accessRequestService.withdraw(req.customData, req.params['requestId']! as string);
  res.sendStatus(StatusCodes.NO_CONTENT);
};
