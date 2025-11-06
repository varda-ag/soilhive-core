import * as express from "express";
import { EntityManager } from "typeorm";

declare global {
  namespace Express {
    interface Request {
      customData: {
        entityManager: EntityManager;
      };
    }
  }
}
