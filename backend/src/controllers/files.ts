import { Request, Response } from "express";
import FileService from "../services/FileService";

const fileService = new FileService();

export const fileUpload = async (req: Request, res: Response) => {
  const data = await fileService.fileUpload(req.body);
  res.json(data);
};

export const fileDownload = async (req: Request, res: Response) => {
  const data = await fileService.fileDownload(req.body);
  res.json(data);
};
