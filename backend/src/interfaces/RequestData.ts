import { EntityManager } from 'typeorm';
import { Token } from '../interfaces/Token';
import { Entitlements } from '../types/Entitlements';

export interface RequestData {
  entityManager: EntityManager;
  token?: Token;
  uploadedFileInfo?: {
    originalname?: string;
    fileKey?: string;
  };
  entitlements: Entitlements;
}
