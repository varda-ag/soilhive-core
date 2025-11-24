import { NextFunction, Request, Response } from "express";
import FileService from "../services/FileService";
import multer from "multer";
import { JsonStorage } from "../entities/JsonStorage";

const fileService = new FileService();

export const fileUpload = async (req: Request, res: Response, next: NextFunction) => {
  const repo = req.customData.entityManager.getRepository(JsonStorage);
  const upload = multer({ storage: await fileService.getStorageEngine(repo) });
  upload.single("file")(req, res, (err: any) => {
    if (err) {
      return next(err);
    }
    res.json({ message: "File uploaded successfully", file: req.file });
  });
};

export const fileDownload = async (req: Request, res: Response) => {
  const data = await fileService.fileDownload(req.body);
  res.json(data);
};
