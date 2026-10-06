import { Request, Response } from 'express';
import StatusCodes from 'http-status-codes';
import SoilIndexTileService from '../services/SoilIndexTileService';
import SoilIndexRunService from '../services/SoilIndexRunService';
import { gunzipTile } from '../data-layer/SoilIndexTiles';

const soilIndexTileService = new SoilIndexTileService();
const soilIndexRunService = new SoilIndexRunService();

export const postSoilIndex = async (req: Request, res: Response) => {
  const run = await soilIndexRunService.createSoilIndexRun(req.customData, req.body);
  res.status(StatusCodes.CREATED).json(run);
};

export const getSoilIndexById = async (req: Request, res: Response) => {
  const run = await soilIndexRunService.getSoilIndexRun(req.customData, req.params['runId'] as string);
  res.json(run);
};

export const deleteSoilIndexById = async (req: Request, res: Response) => {
  await soilIndexRunService.deleteSoilIndexRun(req.customData, req.params['runId'] as string);
  res.sendStatus(StatusCodes.NO_CONTENT);
};

// A Run never changes once written, and the Run id is the whole permission to read it (docs/adr/0039),
// so tiles and scores may be cached anywhere, for good.
const IMMUTABLE = 'public, max-age=31536000, immutable';

export const getSoilIndexTileJson = async (req: Request, res: Response) => {
  const tileJson = await soilIndexTileService.getTileJson(req.params['runId'] as string);
  // Short, unlike the tiles: the tile paths it lists change with the tiling version (docs/adr/0043).
  res.set('Cache-Control', 'public, max-age=300').json(tileJson);
};

export const getSoilIndexTile = async (req: Request, res: Response) => {
  const data = await soilIndexTileService.getTile(
    req.params['runId'] as string,
    Number(req.params['version']),
    { z: Number(req.params['z']), x: Number(req.params['x']), y: Number(req.params['y']) },
    req.customData.signal,
  );
  res.set('Cache-Control', IMMUTABLE);
  if (!data) {
    res.sendStatus(StatusCodes.NO_CONTENT);
    return;
  }
  res.type('application/vnd.mapbox-vector-tile').vary('Accept-Encoding');
  // Tiles are kept gzipped; every browser accepts that as is.
  if (req.acceptsEncodings('gzip')) {
    res.set('Content-Encoding', 'gzip').send(data);
  } else {
    res.send(await gunzipTile(data));
  }
};

export const getSoilIndexScore = async (req: Request, res: Response) => {
  const score = await soilIndexTileService.getScore(req.params['runId'] as string, Number(req.params['scoreId']));
  res.set('Cache-Control', IMMUTABLE).json(score);
};
