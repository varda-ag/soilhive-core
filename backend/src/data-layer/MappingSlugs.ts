import { EntityManager } from 'typeorm';
import { PropertyMapping } from '../interfaces/PropertyMapping';
import { EntityType } from '../types/data';

/** The ids a saved mapping entry gives: slugs, as they were when it was saved. */
export type MappingIds = Partial<Pick<PropertyMapping, 'property_id' | 'conversion_id' | 'procedure_id'>>;

/**
 * The current slug of each slug saved mappings give, by kind. A renamed entity keeps its old slugs
 * in slug_history; a slug of an entity that is gone or soft-deleted is not in the map.
 */
export interface MappingSlugs {
  property: Map<string, string>;
  conversion: Map<string, { slug: string; property: string }>; // With the current slug of its property
  procedure: Map<string, string>;
}

const named = (entries: MappingIds[], key: keyof MappingIds): string[] => [
  ...new Set(entries.map(entry => entry[key]).filter((slug): slug is string => typeof slug === 'string' && slug !== '')),
];

const currentSlugs = async (entityManager: EntityManager, entityType: EntityType, slugs: string[]): Promise<Map<string, string>> => {
  if (slugs.length === 0) return new Map();
  // EntityType values are the table names
  const rows: { old_slug: string; slug: string }[] = await entityManager.query(
    `SELECT h.slug AS old_slug, e.slug
     FROM slug_history h
     JOIN "${entityType}" e ON e.id = h.entity_id AND e.deleted_at IS NULL
     WHERE h.entity_type = $1 AND h.slug = ANY($2)`,
    [entityType, slugs],
  );
  return new Map(rows.map(row => [row.old_slug, row.slug]));
};

const currentConversionSlugs = async (entityManager: EntityManager, slugs: string[]): Promise<MappingSlugs['conversion']> => {
  if (slugs.length === 0) return new Map();
  const rows: { old_slug: string; slug: string; property: string }[] = await entityManager.query(
    `SELECT h.slug AS old_slug, c.slug, p.slug AS property
     FROM slug_history h
     JOIN unit_conversions c ON c.id = h.entity_id AND c.deleted_at IS NULL
     JOIN soil_properties p ON p.id = c.property_id
     WHERE h.entity_type = $1 AND h.slug = ANY($2)`,
    [EntityType.UNIT_CONVERSION, slugs],
  );
  return new Map(rows.map(row => [row.old_slug, { slug: row.slug, property: row.property }]));
};

/** Looks up the current slugs of what the given entries name: one query per kind, none for a kind they don't name. */
export const loadMappingSlugs = async (entityManager: EntityManager, entries: MappingIds[]): Promise<MappingSlugs> => {
  const [property, conversion, procedure] = await Promise.all([
    currentSlugs(entityManager, EntityType.SOIL_PROPERTY, named(entries, 'property_id')),
    currentConversionSlugs(entityManager, named(entries, 'conversion_id')),
    currentSlugs(entityManager, EntityType.PROCEDURE, named(entries, 'procedure_id')),
  ]);
  return { property, conversion, procedure };
};

/**
 * The entry with each slug replaced by its current one. A conversion or procedure that is gone is
 * left out, and so is a conversion that now belongs to another property (its slug follows its
 * property). null when the property is gone: the entry then answers nothing.
 */
export const withCurrentSlugs = <T extends MappingIds>(entry: T, slugs: MappingSlugs): T | null => {
  const current: MappingIds = { ...entry };
  if (entry.property_id) {
    const property = slugs.property.get(entry.property_id);
    if (!property) return null;
    current.property_id = property;
  }
  if (entry.conversion_id) {
    const conversion = slugs.conversion.get(entry.conversion_id);
    if (conversion && (!current.property_id || conversion.property === current.property_id)) {
      current.conversion_id = conversion.slug;
    } else {
      delete current.conversion_id;
    }
  }
  if (entry.procedure_id) {
    const procedure = slugs.procedure.get(entry.procedure_id);
    if (procedure) {
      current.procedure_id = procedure;
    } else {
      delete current.procedure_id;
    }
  }
  return current as T;
};
