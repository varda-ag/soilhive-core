import { JwtPayload } from "jsonwebtoken";

export interface Token extends JwtPayload {
  raw: string;
  email: string;
  scope: string;
  isSuperAdmin(): boolean;
  isDataAdmin(): boolean;
}
