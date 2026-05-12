import assert from 'assert';
import { DataAvailabilityIndex } from '../interfaces/Dai';

export default class DaiService {
  async getDai(bbox: [number, number, number, number], resolution: number): Promise<DataAvailabilityIndex> {
    assert(bbox.length === 4, 'Invalid bbox');
    assert(resolution >= 0, 'Invalid resolution');
    return {
      resolution,
      min: 1,
      max: 1,
      cells: {
        '831ea6fffffffff': 1,
      },
    };
  }
}
