import { Request, Response } from 'express';
import EntitlementService from '../services/EntitlementService';
import { StatusCodes } from 'http-status-codes';
import { errorMiddleware } from '../middlewares/error';

const entitlementService = new EntitlementService();

export const getDatasetEntitlements = async (req: Request, res: Response) => {
  const slug = req.params['datasetId']!;
  const data = await entitlementService.getEntityEntitlements(req.customData, slug);
  res.json(data);
};

export const setDatasetEntitlement = async (req: Request, res: Response) => {
  const slug = req.params['datasetId']!;
  const data = await entitlementService.setEntityEntitlements(req.customData, slug, req.body);
  res.json(data);
};

export const getUserEntitlements = async (req: Request, res: Response) => {
  if (process.env.ENTITLEMENTS_ENDPOINT) {
    callEntitlementsEndpoint(req, res);
    return;
  }
  const data = await entitlementService.getUserEntitlements(req.customData, req.customData.token?.email);
  res.json(data);
};

export const callEntitlementsEndpoint = async (req: Request, res: Response) => {
  try {
    const response = await fetch(process.env.ENTITLEMENTS_ENDPOINT!, {
      method: req.method,
      headers: req.headers as Record<string, string>,
    });
    if (!response.ok) {
      const message = await response.text();
      errorMiddleware({ message: `Failed to fetch entitlements from endpoint: ${message}`, status: response.status }, req, res, () => {});
      return;
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    errorMiddleware(
      { message: `Failed to fetch entitlements from endpoint: ${error}`, status: StatusCodes.INTERNAL_SERVER_ERROR },
      req,
      res,
      () => {},
    );
  }
};
