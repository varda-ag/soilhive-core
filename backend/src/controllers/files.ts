import { NextFunction, Request, Response } from 'express';
import { FileStorage } from '@flystorage/file-storage';
import { StatusCodes } from 'http-status-codes';
import { LOGO_FILE_ID } from '../constants/constants';
import { idToSlug } from '../utils/slugs';
import FileService from '../services/FileService';
import { ErrorResponse } from '../utils/error';
import { verifySignedPath } from '../utils/presigned-url';
import * as path from 'path';
import mime from 'mime-types';

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
    res.status(StatusCodes.CREATED).json(idToSlug(fileEntity));
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

export const download = async (req: Request, res: Response, next: NextFunction) => {
  const filename = req.params['fileId']!;
  const token = req.query['token'] as string;

  // this checks token validity only. Token presence is checked by middleware thorugh openapi spec
  verifySignedPath(filename, token);

  const basename = path.basename(filename!);
  res.setHeader('Content-Disposition', `attachment; filename="${basename}"`);

  const contentType = mime.lookup(basename) || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);

  const storage: FileStorage = FileService.getStorageEngine();
  const fileStream = await storage.read(filename);
  fileStream.pipe(res);
  fileStream.on('error', err => {
    next(err);
  });
};
