import { Job } from 'pg-boss';
import { SoilIndexTilesJob } from '../../interfaces/Job';
import { JobQueues } from '../../types/enums';
import { prerenderSoilIndexTiles } from '../../data-layer/SoilIndexTiles';
import { getEntityManager } from '../../utils/data-source';
import { getTilesPrerenderMaxTiles, getTilesPrerenderMinVertices } from '../../utils/utils';
import { log } from '../../utils/logger';

/**
 * Pre-renders the heaviest tiles of one completed Soil Index Run (docs/adr/0043). An optimisation,
 * not a resource: nobody polls it, and until it finishes every tile is still cut on request.
 */
export async function processSoilIndexTiles(job: Job<SoilIndexTilesJob>): Promise<void> {
  const { run } = job.data;
  const maxTiles = getTilesPrerenderMaxTiles();
  const { rendered, capped, destroyed } = await prerenderSoilIndexTiles(await getEntityManager(), run, {
    minVertices: getTilesPrerenderMinVertices(),
    maxTiles,
  });

  // Deleted before or while its tiles were rendered: nothing to keep (docs/adr/0044).
  if (destroyed) {
    log.info('Soil index run destroyed, tiles not pre-rendered', { job_id: job.id, run });
    return;
  }

  // Over the cap the remaining heavy tiles are cut on request, without the per-tile bound the
  // pre-render budget otherwise guarantees.
  if (capped) {
    log.warn('Soil index tile pre-rendering capped', { job_id: job.id, run, max_tiles: maxTiles });
  }
  log.info('Soil index tiles pre-rendered', { job_id: job.id, queue: JobQueues.SOIL_INDEX_TILES, run, rendered, capped });
}
