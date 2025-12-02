import { Request, Response } from "express";
import DatasetService from "../services/DatasetService";

const datasetService = new DatasetService();

export const postDatasetsFilters = async (req: Request, res: Response) => {
  const data = await datasetService.postFilter(req.customData, req.body);
  res.json(data);
};
