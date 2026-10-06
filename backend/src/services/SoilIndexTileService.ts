import pLimit from 'p-limit';
import { StatusCodes } from 'http-status-codes';
import { TILE_MAX_ZOOM } from '../data-layer/SoilIndex';
import {
  findPrerenderedTile,
  forgetSoilIndexTiling,
  getSoilIndexScore,
  getSoilIndexTiling,
  gzipTile,
  isUndefinedTable,
  renderTile,
  SoilIndexScore,
  TILE_LAYER,
  TileAddress,
  tileTouchesBounds,
  TILING_VERSION,
} from '../data-layer/SoilIndexTiles';
import { runCancelableQuery } from '../utils/cancelable-query';
import { getEntityManager } from '../utils/data-source';
import { ErrorResponse } from '../utils/error';
import { getTilesConcurrency } from '../utils/utils';

/**
 * TileJSON 3.0.0, except that `tiles` holds paths relative to the API base: the backend does not
 * know its public origin, so clients prepend it (docs/adr/0043).
 */
export interface SoilIndexTileJson {
  tilejson: '3.0.0';
  tiles: string[];
  minzoom: number;
  maxzoom: number;
  bounds?: [number, number, number, number];
  vector_layers: { id: string; minzoom: number; maxzoom: number; fields: Record<string, string> }[];
}

// Every tile query on this node shares it: a fast pan fires dozens of tile requests at once, which
// would otherwise take that many connections from the pool the rest of the API draws on.
const limit = pLimit(getTilesConcurrency());

const notFound = (run: string) => new ErrorResponse(`Soil index run '${run}' not found`, StatusCodes.NOT_FOUND);

export default class SoilIndexTileService {
  /** 404 for an unknown Run, and for one still running. */
  getTileJson = async (run: string): Promise<SoilIndexTileJson> => {
    const entityManager = await getEntityManager();
    const tiling = await limit(() => getSoilIndexTiling(entityManager, run));
    if (!tiling) {
      throw notFound(run);
    }
    return {
      tilejson: '3.0.0',
      tiles: [`/soil-indexes/${run}/tiles/${TILING_VERSION}/{z}/{x}/{y}`],
      minzoom: 0,
      maxzoom: TILE_MAX_ZOOM,
      ...(tiling.bounds ? { bounds: tiling.bounds } : {}),
      vector_layers: [
        {
          id: TILE_LAYER,
          minzoom: 0,
          maxzoom: TILE_MAX_ZOOM,
          // count, min and max are on cells only; on a Scored Geometry they are absent.
          fields: { value: 'Number', year: 'Number', count: 'Number', min: 'Number', max: 'Number' },
        },
      ],
    };
  };

  /** One tile as gzipped MVT, or null when nothing in it is drawn. */
  getTile = async (run: string, version: number, tile: TileAddress, signal: AbortSignal | undefined): Promise<Buffer | null> => {
    // Only the current version is served: an older one names tiles that are no longer produced.
    if (version !== TILING_VERSION) {
      throw new ErrorResponse(`Unknown tiling version ${version}`, StatusCodes.NOT_FOUND);
    }
    if (tile.x >= 2 ** tile.z || tile.y >= 2 ** tile.z) {
      throw new ErrorResponse(`No tile ${tile.x}/${tile.y} at zoom ${tile.z}`, StatusCodes.BAD_REQUEST);
    }
    const entityManager = await getEntityManager();

    return limit(async () => {
      // Panned away from while queued: nobody is waiting for it.
      if (signal?.aborted) {
        return null;
      }
      const tiling = await getSoilIndexTiling(entityManager, run);
      if (!tiling) {
        throw notFound(run);
      }
      if (tiling.detailZoom === null || !tiling.bounds || !tileTouchesBounds(tile, tiling.bounds)) {
        return null;
      }
      const prerendered = await findPrerenderedTile(entityManager, run, tile);
      if (prerendered) {
        return prerendered;
      }
      try {
        const mvt = await runCancelableQuery(entityManager, signal, transactionalEntityManager =>
          renderTile(transactionalEntityManager, run, tiling.detailZoom!, tile),
        );
        return mvt ? await gzipTile(mvt) : null;
      } catch (error) {
        // Cancelled because the client went away; there is no one to report the error to.
        if (signal?.aborted) {
          return null;
        }
        // Destroyed after this node cached its tiling (docs/adr/0044).
        if (isUndefinedTable(error)) {
          forgetSoilIndexTiling(run);
          throw notFound(run);
        }
        throw error;
      }
    });
  };

  getScore = async (run: string, id: number): Promise<SoilIndexScore> => {
    const entityManager = await getEntityManager();
    const score = await limit(() => getSoilIndexScore(entityManager, run, id));
    if (!score) {
      throw new ErrorResponse(`Score ${id} of soil index run '${run}' not found`, StatusCodes.NOT_FOUND);
    }
    return score;
  };
}
