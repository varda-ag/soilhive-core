import { Job } from 'pg-boss';
import { RasterLoadJob } from '../../interfaces/Job';

// TODO(SP-5442): walk the dataset's raster files and run a raster ingest on each.
// Stub for now — the queue, worker and API surface exist so the pipeline can be
// wired up and observed end to end.
export async function processRasterLoad(_job: Job<RasterLoadJob>): Promise<void> {}
