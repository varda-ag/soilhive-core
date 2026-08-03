import { StatusCodes } from 'http-status-codes';
import { DataCleaningConfig } from '../interfaces/DataMapping';
import { PropertyMapping, PropertyCleaningConfig } from '../interfaces/PropertyMapping';
import { RequestData } from '../interfaces/RequestData';
import { DetectableFields, type DataMappingObject } from '../types/DataMapping';
import type { RasterMappingObject, ResolvedBandMapping } from '../interfaces/RasterMapping';
import { ErrorResponse } from '../utils/error';
import { getSubject } from '../utils/auth';
import DataMappingEntity from '../entities/DataMapping';
import UnitConversionEntity from '../entities/UnitConversion';
import SoilPropertyEntity from '../entities/SoilProperty';
import ProcedureEntity from '../entities/Procedure';
import UnitConversionService from './UnitConversionService';
import SoilPropertyService from './SoilPropertyService';
import ProcedureService from './ProcedureService';
import { sanitizeField } from '../utils/utils';

export default class DataMappingService {
  postDataMapping = async (requestData: RequestData, dataMapping: DataMappingObject): Promise<DataMappingEntity> => {
    const subject = getSubject(requestData);
    // Validate
    if (dataMapping.drop_records && !Array.isArray(dataMapping.drop_records)) {
      throw new ErrorResponse(`drop_records must be an array of numbers`, StatusCodes.BAD_REQUEST);
    }
    const repo = requestData.entityManager.getRepository(DataMappingEntity);

    const result = await repo
      .createQueryBuilder()
      .insert()
      .into(DataMappingEntity)
      .values({
        data_mapping: dataMapping,
        created_by: subject,
      })
      .orUpdate(
        ['updated_at'], // on conflict update updated_at timestamp
        ['data_mapping_hash'], // the column with the UNIQUE constraint
      )
      .returning('*') // ensure we get the full record back (Postgres specific)
      .execute();

    const row = result.raw[0] as DataMappingEntity;

    return repo.create(row);
  };

  parseDataMapping = async (requestData: RequestData, id: string): Promise<DataCleaningConfig> => {
    const result: DataCleaningConfig = {
      metadata_cols: {},
      property_cols: {},
    };
    const dataMappingEntity = await this.getDataMapping(requestData, id);
    const data_mapping = dataMappingEntity.data_mapping;

    const conversionSlugs: string[] = [
      ...new Set(
        Object.values(data_mapping)
          .filter(
            mapping =>
              typeof mapping === 'object' &&
              (mapping as PropertyMapping).conversion_id &&
              (mapping as PropertyMapping).conversion_id !== null,
          )
          .map(mapping => (mapping as PropertyMapping).conversion_id!),
      ),
    ];

    const ucService = new UnitConversionService();
    const ucInfos = await ucService.getUnitConversionsBySlug(requestData, conversionSlugs);

    let ucInfoMap: Map<string, UnitConversionEntity>;
    const propertySlugs: string[] = [
      ...new Set(
        Object.values(data_mapping)
          .filter(mapping => typeof mapping === 'object' && (mapping as PropertyMapping).property_id !== undefined)
          .map(mapping => (mapping as PropertyMapping).property_id),
      ),
    ];

    const spService = new SoilPropertyService();
    const spInfos = await spService.getSoilPropertiesBySlug(requestData, propertySlugs);

    const spInfoMap = spInfos.reduce(
      (acc, info) => {
        acc[info.slug] = info;
        return acc;
      },
      {} as Map<string, SoilPropertyEntity>,
    );

    const procedureSlugs: string[] = [
      ...new Set(
        Object.values(data_mapping)
          .filter(
            mapping =>
              typeof mapping === 'object' &&
              (mapping as PropertyMapping).procedure_id &&
              (mapping as PropertyMapping).procedure_id !== null,
          )
          .map(mapping => (mapping as PropertyMapping).procedure_id!),
      ),
    ];

    const pService = new ProcedureService();
    const pInfos = await pService.getProceduresBySlug(requestData, procedureSlugs);

    const pInfoMap = pInfos.reduce(
      (acc, info) => {
        acc[info.slug] = info;
        return acc;
      },
      {} as Map<string, ProcedureEntity>,
    );

    // Process metadata (string types) and property columns (object types)
    for (const [field, mapping] of Object.entries(data_mapping)) {
      if ([DetectableFields.GEOMETRY, DetectableFields.LATITUDE, DetectableFields.LONGITUDE].includes(mapping as DetectableFields)) {
        continue;
      }
      const sanitizedField = sanitizeField(field);
      if (sanitizedField === 'drop_records') continue;
      if (typeof mapping === 'string' || mapping instanceof String) {
        result.metadata_cols[sanitizeField(mapping as string)] = sanitizedField;
      } else if (typeof mapping === 'object') {
        const props = mapping as PropertyMapping;
        const propsProcessed: PropertyCleaningConfig = props;
        ucInfoMap = ucInfos
          .filter(ucInfo => ucInfo.soil_property.slug == props.property_id)
          .reduce(
            (acc, info) => {
              acc[info.slug] = info;
              return acc;
            },
            {} as Map<string, UnitConversionEntity>,
          );
        const spInfo = spInfoMap[props.property_id];
        const ucInfo = props.conversion_id ? (ucInfoMap[props.conversion_id] ?? null) : null;
        const pInfo = props.procedure_id ? (pInfoMap[props.procedure_id] ?? null) : null;
        propsProcessed.property_id = spInfo.id;
        propsProcessed.standard_unit = spInfo.standard_unit;
        if (ucInfo) {
          propsProcessed.conversion_formula = ucInfo.conversion_formula;
          propsProcessed.original_unit = ucInfo.original_unit_of_measurement;
        }
        if (pInfo) {
          propsProcessed.procedure_id = pInfo.id;
        }
        result.property_cols[sanitizedField] = propsProcessed;
      }
    }
    for (const requiredField of [DetectableFields.SAMPLING_DATE, DetectableFields.LICENSE]) {
      if (!result.metadata_cols[requiredField]) {
        result.metadata_cols[requiredField] = null;
      }
    }
    if (
      !result.metadata_cols[DetectableFields.DEPTH] &&
      !result.metadata_cols[DetectableFields.MIN_DEPTH] &&
      result.metadata_cols[DetectableFields.MAX_DEPTH]
    ) {
      result.metadata_cols[DetectableFields.MIN_DEPTH] = null;
      result.metadata_cols[DetectableFields.MAX_DEPTH] = null;
    }
    if (data_mapping.drop_records && Array.isArray(data_mapping.drop_records)) {
      result.drop_records = data_mapping.drop_records;
    }
    return result;
  };

  /**
   * Resolves a raster file's Band Mapping into per-band ingest input.
   *
   * Deliberately separate from parseDataMapping rather than a branch inside it (docs/adr/0017):
   * that function returns column-cleaning configuration, all of which is tabular, and it sanitises
   * every key into a DB-safe SQL identifier — a transformation a band mapping key cannot survive.
   *
   * Band numbers are parsed but not validated against the file here; the loader does that, so
   * every band failure is raised from one place before any ingest writes anything. The same holds
   * for a band's additional resources: they reference Files, and checking those belongs with the
   * rest of the loader's pre-flight validation rather than here.
   */
  parseRasterDataMapping = async (requestData: RequestData, id: string): Promise<ResolvedBandMapping[]> => {
    const dataMappingEntity = await this.getDataMapping(requestData, id);
    const mapping = dataMappingEntity.data_mapping as unknown as RasterMappingObject;

    const entries = Object.entries(mapping).filter(
      ([, bandMapping]) => bandMapping !== null && typeof bandMapping === 'object' && !Array.isArray(bandMapping),
    );

    const propertySlugs = [...new Set(entries.map(([, b]) => b.property_id).filter(Boolean))];
    const conversionSlugs = [...new Set(entries.map(([, b]) => b.conversion_id).filter((s): s is string => !!s))];
    const procedureSlugs = [...new Set(entries.map(([, b]) => b.procedure_id).filter((s): s is string => !!s))];

    const [properties, conversions, procedures] = await Promise.all([
      propertySlugs.length ? new SoilPropertyService().getSoilPropertiesBySlug(requestData, propertySlugs) : Promise.resolve([]),
      conversionSlugs.length ? new UnitConversionService().getUnitConversionsBySlug(requestData, conversionSlugs) : Promise.resolve([]),
      procedureSlugs.length ? new ProcedureService().getProceduresBySlug(requestData, procedureSlugs) : Promise.resolve([]),
    ]);

    const propertyBySlug = new Map(properties.map(p => [p.slug, p]));
    const conversionBySlug = new Map(conversions.map(c => [c.slug, c]));
    const procedureBySlug = new Map(procedures.map(p => [p.slug, p]));

    return entries.map(([key, bandMapping]) => {
      const property = propertyBySlug.get(bandMapping.property_id);
      const conversion = bandMapping.conversion_id ? conversionBySlug.get(bandMapping.conversion_id) : undefined;
      // Presence, not resolvability: an unknown procedure slug already threw in getProceduresBySlug.
      const procedureSlug = bandMapping.procedure_id && procedureBySlug.has(bandMapping.procedure_id) ? bandMapping.procedure_id : null;

      return {
        band: Number(key),
        soilPropertySlug: bandMapping.property_id,
        procedureSlug,
        minDepth: bandMapping.min_depth ?? null,
        maxDepth: bandMapping.max_depth ?? null,
        referencePeriodStart: bandMapping.reference_period_start ?? null,
        referencePeriodStop: bandMapping.reference_period_stop ?? null,
        standardUnit: property?.standard_unit ?? null,
        originalUnit: conversion?.original_unit_of_measurement ?? null,
        conversionFormula: conversion?.conversion_formula ?? null,
        layerDescription: bandMapping.layer_description ?? null,
        additionalResources: Array.isArray(bandMapping.additional_resources) ? bandMapping.additional_resources : [],
      };
    });
  };

  getDataMappings = async (requestData: RequestData): Promise<DataMappingEntity[]> => {
    const repo = requestData.entityManager.getRepository(DataMappingEntity);
    return await repo.find();
  };

  getDataMapping = async (requestData: RequestData, id: string): Promise<DataMappingEntity> => {
    const repo = requestData.entityManager.getRepository(DataMappingEntity);
    const dataMapping = await repo.findOneBy({ id });
    if (!dataMapping) {
      throw new ErrorResponse(`Mapping with ID ${id} not found`, StatusCodes.NOT_FOUND);
    }
    return dataMapping;
  };

  deleteDataMapping = async (requestData: RequestData, id: string): Promise<void> => {
    const repo = requestData.entityManager.getRepository(DataMappingEntity);

    // check if it exists first to throw a 404 if not found
    const mapping = await repo.findOneBy({ id });
    if (!mapping) {
      throw new ErrorResponse(`Mapping with ID ${id} not found`, StatusCodes.NOT_FOUND);
    }

    // Soft delete sets the deleted_at column
    await repo.softDelete(id);
  };
}
