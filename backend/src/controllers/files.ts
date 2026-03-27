import { NextFunction, Request, Response } from 'express';
import { FileStorage } from '@flystorage/file-storage';
import { StatusCodes } from 'http-status-codes';
import { idToSlug } from '../utils/slugs';
import FileService from '../services/FileService';
import { ErrorResponse } from '../utils/error';
import { verifySignedPath } from '../utils/presigned-url';
import * as path from 'path';
import mime from 'mime-types';
import ConfigService from '../services/ConfigService';
import { JsonStorage } from '../entities/JsonStorage';

const fileService = new FileService();
const configService = new ConfigService();

export const fileUpload = async (req: Request, res: Response) => {
  res.status(StatusCodes.CREATED).json({ message: 'File uploaded successfully', file: req.files?.[0] });
};

export const fileDownload = async (req: Request, res: Response, next: NextFunction) => {
  const file = await fileService.getFile(req.customData, req.params['fileId']!);
  const fileKey = file.file_path as string;
  const exists = await fileService.exists(fileKey);
  if (!exists) {
    throw new ErrorResponse(`File ${req.params['fileId']} not found in ${fileKey}.`, StatusCodes.NOT_FOUND);
  }
  await downloadHelper(fileKey, res, next);
};

export const logoUpload = async (req: Request, res: Response) => {
  await fileUpload(req, res);
  await configService.setLogoFileKey(req.customData.entityManager.getRepository(JsonStorage), req.customData.uploadedFileInfo!.fileKey!);
};

export const logoDownload = async (req: Request, res: Response, next: NextFunction) => {
  const logoFileKey = await configService.getLogoFileKey(req.customData.entityManager.getRepository(JsonStorage));
  if (!logoFileKey) {
    throw new ErrorResponse(`Custom logo not found`, StatusCodes.NOT_FOUND);
  }
  await downloadHelper(logoFileKey, res, next);
};

export const logoDelete = async (req: Request, res: Response) => {
  const logoFileKey = await configService.getLogoFileKey(req.customData.entityManager.getRepository(JsonStorage));
  if (logoFileKey) {
    await fileService.deleteFileFromStorage(logoFileKey);
    await configService.deleteLogoFileKey(req.customData.entityManager.getRepository(JsonStorage));
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

  await downloadHelper(filename, res, next);
};

const downloadHelper = async (fileKey: string, res: Response, next: NextFunction) => {
  const basename = path.basename(fileKey);
  res.setHeader('Content-Disposition', `attachment; filename="${basename}"`);

  const contentType = mime.lookup(basename) || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);

  const storage: FileStorage = FileService.getStorageEngine();
  const fileStream = await storage.read(fileKey);

  // Pipe the file stream to the response
  fileStream.pipe(res);
  fileStream.on('error', err => {
    next(err);
  });
};
