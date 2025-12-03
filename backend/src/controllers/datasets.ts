import { Request, Response } from "express";
import DatasetService from "../services/DatasetService";
import { StatusCodes } from "http-status-codes";

const datasetService = new DatasetService();

export const postDatasetsFilters = async (req: Request, res: Response) => {
  const data = await datasetService.postFilter(req.customData, req.body);
  res.status(StatusCodes.CREATED).json(data);
};
