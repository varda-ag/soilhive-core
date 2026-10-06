import { SoilPropertyClasses } from '../interfaces/SoilProperty';
import { PropertyCleaningConfig } from '../interfaces/PropertyMapping';
import { SoilRecord } from '../interfaces/Record';
import { StatusCodes } from 'http-status-codes';
import { ErrorResponse } from './error';

/** The form labels and aliases are compared in: case, surrounding and repeated whitespace ignored. */
export const normalizeClassLabel = (label: string): string => label.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Label of the class `value` codes for, or null when the property has no classes or `value` is
 * not one of its codes. `value` may come straight from Postgres, where numeric is a string
 * ("1.000" after the cleaning step's rounding).
 */
export const classLabel = (classes: SoilPropertyClasses | null | undefined, value: unknown): string | null => {
  if (!classes || value === null || value === undefined || value === '') return null;
  const code = Number(value);
  if (!Number.isInteger(code)) return null;
  return classes[String(code)]?.label ?? null;
};

/**
 * What a raw value of a categorical property may be, mapped to the class code it stands for:
 * each code as itself ("8" → 8), and each label and alias in normalized form ("silty loam" → 8).
 * The cleaning step looks raw values up in it, after normalizing them the same way.
 */
export const buildClassLookup = (classes: SoilPropertyClasses): Record<string, number> => {
  const lookup: Record<string, number> = {};
  for (const [key, cls] of Object.entries(classes)) {
    const code = Number(key);
    lookup[key] = code;
    for (const name of [cls.label, ...(cls.aliases ?? [])]) lookup[normalizeClassLabel(name)] = code;
  }
  return lookup;
};

const NUMERIC_RE = /^-?\d+(\.\d+)?$/;

/**
 * Whether a loaded value of a categorical property is stored as an observation: false for a
 * missing value, which is skipped as for any property, true otherwise. A value that isn't one of
 * the property's class codes fails the load rather than being dropped: one that isn't a number,
 * or a number (0 and decimals included) with no class.
 */
export const isStorableClassValue = (classes: SoilPropertyClasses, value: unknown, column: string): boolean => {
  if (value === null || value === undefined || value === '') return false;
  const numeric = typeof value === 'number' ? Number.isFinite(value) : typeof value === 'string' && NUMERIC_RE.test(value.trim());
  if (!numeric) {
    throw new ErrorResponse(
      `Column "${column}" holds class codes and must be numeric, but got "${String(value)}"`,
      StatusCodes.BAD_REQUEST,
    );
  }
  // String(Number(...)) normalizes "8.000" to "8", and leaves a decimal like 1.5 matching no key.
  const code = String(Number(value));
  if (!(code in classes)) {
    throw new ErrorResponse(`Column "${column}" holds class codes, and ${code} is not one of them`, StatusCodes.BAD_REQUEST);
  }
  return true;
};

/**
 * Replaces the value of each categorical property column with its class label, for display;
 * a value that is not a known class stays as it is. For the preview only: the bulk load reads
 * VectorDataLoad.getDataPreview directly and must keep the numeric codes. Cursors are unaffected,
 * since getDataPreview has already built them from the codes.
 */
export const substituteClassLabels = (records: SoilRecord[], propertyCols: Record<string, PropertyCleaningConfig>): SoilRecord[] => {
  const categoricalCols = Object.entries(propertyCols).filter(([, cfg]) => cfg.classes);
  if (categoricalCols.length === 0) return records;
  for (const record of records) {
    for (const [col, cfg] of categoricalCols) {
      record[col] = classLabel(cfg.classes, record[col]) ?? record[col] ?? null;
    }
  }
  return records;
};
