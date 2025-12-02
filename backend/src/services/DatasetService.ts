import { DatasetFilter, PostDatasetFilterResponse } from "../interfaces/DatasetFilter";
import { JsonStorage } from "../entities/JsonStorage";
import { RequestData } from "../interfaces/RequestData";
import { v7 as uuidv7 } from "uuid";
import { ErrorResponse } from "../utils/error";
import { StatusCodes } from "http-status-codes";

export default class DatasetService {
  postFilter = async (requestData: RequestData, filter: DatasetFilter): Promise<PostDatasetFilterResponse> => {
    if (!["Polygon", "MultiPolygon"].includes(filter.geometry.type)) {
      throw new ErrorResponse(`Unsupported filtering geometry type: ${filter.geometry.type} (allowed: Polygon, MultiPolygon)`, StatusCodes.BAD_REQUEST);
    }
    const userId = requestData.token ? requestData.token.sub : "anonymous";
    const storageId = `filter_${userId}`;
    const repo = requestData.entityManager.getRepository(JsonStorage);
    const row = await repo.findOneBy({ id: storageId });

    const response: PostDatasetFilterResponse = {
      id: uuidv7(),
      name: new Date().toISOString(),
      filter,
      datasets: [],
    };

    if (row) {
      // Adding this filter to the existing user defined ones
      row.data[response.id] = response;
      row.save();
    } else {
      // Creating user filter preferences
      const newRow = new JsonStorage();
      newRow.id = storageId;
      newRow.data = {};
      newRow.data[response.id] = response;
      await repo.save(newRow);
    }

    return response;
  };
}
