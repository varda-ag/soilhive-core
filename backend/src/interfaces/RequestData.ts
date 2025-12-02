import { EntityManager } from "typeorm";
import { Token } from "../interfaces/Token";

export interface RequestData {
  entityManager: EntityManager;
  token: Token;
}
