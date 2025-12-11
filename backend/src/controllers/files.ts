import { NextFunction, Request, Response } from 'express';
import FileService from '../services/FileService';
import { FileStorage } from '@flystorage/file-storage';
import { StatusCodes } from 'http-status-codes';
import { LOGO_FILE_ID } from '../constants/constants';

const fileService = new FileService();

export const fileUpload = async (req: Request, res: Response) => {
  res.json({ message: 'File uploaded successfully', file: req.files?.[0] });
};

export const fileDownload = async (req: Request, res: Response, next: NextFunction) => {
  const filename = req.params['fileId']!;
  const storage: FileStorage = FileService.getStorageEngine();
  const fileStream = await storage.read(filename);
  // Pipe the file stream to the response
  fileStream.pipe(res);
  fileStream.on('error', err => {
    next(err);
  });
};

export const logoDownload = async (req: Request, res: Response, next: NextFunction) => {
  const customLogoExists = await fileService.exists(LOGO_FILE_ID);
  if (!customLogoExists) {
    // If no custom logo, serve the default one from the public folder
    return res.sendFile('soilhive-logo.svg', { root: 'src/assets' });
  }
  req.params['fileId'] = LOGO_FILE_ID;
  return await fileDownload(req, res, next);
};

export const logoDelete = async (req: Request, res: Response) => {
  const customLogoExists = await fileService.exists(LOGO_FILE_ID);
  if (customLogoExists) {
    await fileService.deleteFile(LOGO_FILE_ID);
  }
  res.sendStatus(StatusCodes.NO_CONTENT);
};
