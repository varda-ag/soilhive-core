import { JwtPayload } from "jsonwebtoken";

export interface Token extends JwtPayload {
  raw: string;
  email: string;
  scope: string;
  isPlatformAdmin(): boolean;
  isDataAdmin(): boolean;
}
