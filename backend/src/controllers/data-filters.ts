import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { parseBboxString } from '../utils/geometry';
import FilterService from '../services/FilterService';

const filterService = new FilterService();

export const postDataFilters = async (req: Request, res: Response) => {
  const data = await filterService.createFilter(req.customData, req.body);
  res.status(StatusCodes.CREATED).json(data);
};

export const getDataFilters = async (req: Request, res: Response) => {
  const data = await filterService.getFilters(req.customData);
  res.json(data);
};

export const getDataFilterById = async (req: Request, res: Response) => {
  const data = await filterService.getDataFilterEntityById(req.customData, req.params['filterId']! as string);
  res.json(data);
};

export const getDataFilterCoverage = async (req: Request, res: Response) => {
  const data = await filterService.getCoverage(req.customData, req.params['filterId']! as string, !!req.query['geometryOnly']);
  res.json(data);
};

export const getDataFilterDatasets = async (req: Request, res: Response) => {
  const data = await filterService.getDatasets(req.customData, req.params['filterId']! as string);
  res.json(data);
};

export const getDataFilterGeometries = async (req: Request, res: Response) => {
  const limit = Number(req.query['limit'] ?? 100);
  const cursor = req.query['cursor'] as string | undefined;
  const { total, features, nextCursor } = await filterService.getFilterGeometries(
    req.customData,
    req.params['filterId']! as string,
    limit,
    cursor,
  );
  // A FeatureCollection with `total`/`limit`/`next_cursor` as GeoJSON foreign members, so
  // the payload stays directly consumable by any GeoJSON client while remaining pageable.
  // `next_cursor` is null on the last page — that, not an empty `features`, is the signal
  // to stop walking.
  res.json({
    type: 'FeatureCollection',
    total,
    limit,
    next_cursor: nextCursor,
    features: features.map(feature => ({
      type: 'Feature',
      id: feature.id,
      geometry: feature.geometry,
      properties: { area_m2: feature.area_m2 },
    })),
  });
};

export const getDai = async (req: Request, res: Response): Promise<void> => {
  const filterId = req.params['filterId']! as string;
  const { bbox: bboxString, resolution } = req.query;
  const bbox = parseBboxString(bboxString! as string);
  const dai = await filterService.getDai(req.customData, bbox, Number(resolution!), filterId);
  res.json(dai);
};
