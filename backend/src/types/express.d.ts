import * as express from "express";
import { EntityManager } from "typeorm";
import { Token } from "../interfaces/Token";

declare global {
  namespace Express {
    interface Request {
      customData: {
        entityManager: EntityManager;
        token: Token;
      };
    }
  }
}
