import "dotenv/config";
import { DataSource } from "typeorm";

export default new DataSource({
  type: "postgres",
  host: process.env.POSTGRES_HOST!,
  port: Number(process.env.POSTGRES_PORT!),
  username: process.env.POSTGRES_USER!,
  password: process.env.POSTGRES_PASSWORD!,
  database: process.env.POSTGRES_DB!,
  schema: process.env.POSTGRES_SCHEMA!,
  entities: ["dist/entities/*.js"],
  migrations: ["dist/migrations/*.js"],
});
