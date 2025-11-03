import { JsonStorage } from "../entities/JsonStorage";
import { ErrorResponse } from "../utils/error";
import { Repository } from "typeorm";

export default class ConfigService {
  putConfig = async (repo: Repository<JsonStorage>, id: string, data: any): Promise<any> => {
    await repo.upsert([{ id, data, deletedAt: null }], ["id"]);
    return await this.getConfig(repo, id);
  };

  getConfig = async (repo: Repository<JsonStorage>, id: string): Promise<any> => {
    const row = await repo.findOneBy({ id });
    if (!row) {
      throw new ErrorResponse("Configuration not found", 404);
    }
    return row.data;
  };

  deleteConfig = async (repo: Repository<JsonStorage>, id: string): Promise<void> => {
    await repo.softDelete({ id });
  };
}
