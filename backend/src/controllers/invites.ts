import { Request, Response } from 'express';
import StatusCodes from 'http-status-codes';
import InviteService from '../services/InviteService';

const inviteService = new InviteService();

export const createInvite = async (req: Request, res: Response) => {
  res.status(StatusCodes.CREATED).json(await inviteService.createInvite(req.customData, req.body));
};

export const redeemInvite = async (req: Request, res: Response) => {
  res.json({ grants: await inviteService.redeemInvite(req.customData, req.body.token) });
};

export const getInvites = async (req: Request, res: Response) => {
  const configId = req.query['config_id'] as string | undefined;
  const datasetId = req.query['dataset_id'] as string | undefined;
  res.json(await inviteService.listInvites(req.customData, { configId, datasetId }));
};

export const deleteInvite = async (req: Request, res: Response) => {
  await inviteService.withdrawInvite(req.customData, req.params['inviteId']! as string);
  res.sendStatus(StatusCodes.NO_CONTENT);
};
