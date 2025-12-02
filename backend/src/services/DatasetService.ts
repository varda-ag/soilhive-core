import { StatusCodes } from "http-status-codes";
import { v7 as uuidv7 } from "uuid";
import { JsonStorage } from "../entities/JsonStorage";
import { DatasetFilter, PostDatasetFilterResponse } from "../interfaces/DatasetFilter";
import { RequestData } from "../interfaces/RequestData";
import { ErrorResponse } from "../utils/error";

export default class DatasetService {
  postFilter = async (requestData: RequestData, filter: DatasetFilter): Promise<PostDatasetFilterResponse> => {
    // Validate geometries in the payload
    for (const geometry of filter.geometries) {
      if (!["Polygon", "MultiPolygon"].includes(geometry.type)) {
        throw new ErrorResponse(`Unsupported filtering geometry type: ${geometry.type} (allowed: Polygon, MultiPolygon)`, StatusCodes.BAD_REQUEST);
      }
    }

    const userId = requestData.token ? requestData.token.sub : "anonymous";
    const storageId = `filter_${userId}`;
    const repo = requestData.entityManager.getRepository(JsonStorage);
    const row = await repo.findOneBy({ id: storageId });

    const response: PostDatasetFilterResponse = {
      id: uuidv7(),
      name: new Date().toISOString(),
      ...filter,
      results: [],
    };

    // TODO: fill results
    for (const _ of filter.geometries) {
      response.results.push({ datasets: [] });
    }

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
