import { DatasetFilter, PostDatasetFilterResponse } from "../interfaces/DatasetFilter";
import { JsonStorage } from "../entities/JsonStorage";
import { RequestData } from "../interfaces/RequestData";
import { v7 as uuidv7 } from "uuid";

export default class DatasetService {
  postFilter = async (requestData: RequestData, filter: DatasetFilter): Promise<PostDatasetFilterResponse> => {
    const storageId = `filter_${requestData.token.sub}`;
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
      const data = {};
      data[response.id] = response;
      await repo.create({ id: storageId, data });
    }

    return response;
  };
}
