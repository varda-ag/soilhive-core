import { NextFunction, Request, Response } from 'express';
import FileService from '../services/FileService';
import { FileStorage } from '@flystorage/file-storage';
import { StatusCodes } from 'http-status-codes';
import { LOGO_FILE_ID } from '../constants/constants';
import { getNewPath, idToSlug } from '../utils/slugs';
import { sanitizeField } from 'src/utils/utils';
import multer from 'multer';
import { IngestionStatus } from 'src/types/data';

const fileService = new FileService();

export const fileUpload = async (req: Request, res: Response) => {
  res.json({ message: 'File uploaded successfully', file: req.files?.[0] });
};

export const fileDownload = async (req: Request, res: Response, next: NextFunction) => {
  const file = await fileService.getFile(req.customData, req.params['fileId']!);
  const storage: FileStorage = FileService.getStorageEngine();
  const fileStream = await storage.read(file.file_path!);
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

export const createFile = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // 1️⃣ Create FileEntity BEFORE upload
    const name = sanitizeField(req['filename'] as string);
    const fileEntity = await fileService.createFile(req.customData, { name });
    let status = IngestionStatus.PENDING;
    (req as any).fileEntity = fileEntity;

    const upload = multer({
      storage: FileService.getUploadStorageEngine(),
    }).single('file');

    upload(req, res, async (err) => {
      if (err) {
        status = IngestionStatus.FAILED;
        await fileService.updateFile(
          req.customData,
          fileEntity.slug,
          { status },
        );
        return next(err);
      }

      const fileKey = `${fileEntity.slug}/${fileEntity.name}`;
      try {
        const metadata = await fileService.extractMetadata(fileKey);
        const data = await fileService.updateFile(
          req.customData,
          fileEntity.slug,
          {
            status,
            metadata,
            file_path: fileKey,
          },
        );
        res.status(StatusCodes.CREATED).json(idToSlug(data));
      } catch (postErr) {
        status = IngestionStatus.FAILED;
        await fileService.updateFile(
          req.customData,
          fileEntity.slug,
          { status },
        );
        next(postErr);
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getFile = async (req: Request, res: Response) => {
  const oldId = req.params['fileId']!;
  const data = await fileService.getFile(req.customData, oldId);

  if (data.slug !== oldId) {
    const newPath = getNewPath(req.path, oldId, data.slug);
    res.redirect(StatusCodes.MOVED_PERMANENTLY, newPath);
    return;
  }

  res.json(idToSlug(data));
};
