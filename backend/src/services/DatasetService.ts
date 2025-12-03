import { StatusCodes } from "http-status-codes";
import { hasher } from "node-object-hash";
import { JsonStorage } from "../entities/JsonStorage";
import { DatasetFilter, PostDatasetFilterResponse, StoredDatasetFilter } from "../interfaces/DatasetFilter";
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

    const storedFilter = {
      id: hasher().hash(filter),
      name: new Date().toISOString(),
      ...filter,
    };

    await this.saveFilterInDB(requestData, storedFilter);

    // TODO: query DB and fill results
    const response: PostDatasetFilterResponse = { ...storedFilter, results: [] };
    for (const _ of filter.geometries) {
      response.results.push({ datasets: [] });
    }

    return response;
  };

  saveFilterInDB = async (requestData: RequestData, filter: StoredDatasetFilter) => {
    if (!requestData.token) {
      // Only logged in users can save filters
      return;
    }

    const userId = requestData.token.sub;
    const storageId = `filter_${userId}`;
    const repo = requestData.entityManager.getRepository(JsonStorage);
    const row = await repo.findOneBy({ id: storageId });

    if (row) {
      // Adding this filter to the existing user defined ones
      row.data[filter.id] = filter;
      await row.save();
    } else {
      // Creating user filter preferences
      const newRow = new JsonStorage();
      newRow.id = storageId;
      newRow.data = {};
      newRow.data[filter.id] = filter;
      await repo.save(newRow);
    }
  };
}
