import { NextFunction, Request, Response } from 'express';
import { FileStorage } from '@flystorage/file-storage';
import { StatusCodes } from 'http-status-codes';
import { LOGO_FILE_ID } from '../constants/constants';
import { idToSlug } from '../utils/slugs';
import { IngestionStatus } from '../types/data';
import FileService from '../services/FileService';
import { ErrorResponse } from '../utils/error';

const fileService = new FileService();

export const fileUpload = async (req: Request, res: Response) => {
  res.json({ message: 'File uploaded successfully', file: req.files?.[0] });
};

export const fileDownload = async (req: Request, res: Response, next: NextFunction) => {
  const file = await fileService.getFile(req.customData, req.params['fileId']!);
  const storage: FileStorage = FileService.getStorageEngine();
  const fileKey = file.file_path as string;
  const exists = await fileService.exists(fileKey);
  if (!exists) {
    throw new ErrorResponse(`File ${req.params['fileId']} not found in ${fileKey} .`, StatusCodes.NOT_FOUND);
  }
  const fileStream = await storage.read(fileKey);
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
    await fileService.deleteFileFromStorage(LOGO_FILE_ID);
  }
  res.sendStatus(StatusCodes.NO_CONTENT);
};

export const createFile = async (req: Request, res: Response, next: NextFunction) => {
  let fileEntity;
  try {
    if (!req.customData.uploadedFileInfo) {
      throw new ErrorResponse('Uploaded file information missing from request', StatusCodes.BAD_REQUEST);
    }
    fileEntity = await fileService.createFile(req.customData, {
      name: req.customData.uploadedFileInfo.originalname!,
      file_path: req.customData.uploadedFileInfo.fileKey!,
    });

    const metadata = await fileService.extractMetadata(fileEntity.file_path);
    const data = await fileService.updateFile(req.customData, fileEntity.slug, {
      status: IngestionStatus.PENDING,
      metadata,
    });
    res.status(StatusCodes.CREATED).json(idToSlug(data));
  } catch (err) {
    console.error('Upload failed', err);
    if (req.customData.uploadedFileInfo) {
      fileService.deleteFileFromStorage(req.customData.uploadedFileInfo.fileKey!);
    }
    if (fileEntity) {
      fileService.deleteFile(req.customData, fileEntity.slug);
    }
    next(err);
  }
};

export const getFile = async (req: Request, res: Response) => {
  const { fileId } = req.params;

  const result = await fileService.getFile(req.customData, fileId!);

  res.json(idToSlug(result));
};
