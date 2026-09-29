import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, TextInput } from 'components/UI';
import useTheme from 'hooks/useTheme';
import type { ExportLimits } from 'types/config';

import styles from './ExportSettings.module.scss';

type Limit = 'area' | 'observations' | 'rasterLayers';

const LIMITS: { key: Limit; i18nKey: string; isInteger: boolean }[] = [
  { key: 'area', i18nKey: 'area', isInteger: false },
  { key: 'observations', i18nKey: 'observations', isInteger: true },
  { key: 'rasterLayers', i18nKey: 'raster_layers', isInteger: true },
];

const M2_PER_KM2 = 1e6;

const isSet = (value: unknown): value is number => typeof value === 'number';

function isValid(value: string, isInteger: boolean): boolean {
  if (value.trim() === '') return false;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && (!isInteger || Number.isInteger(number));
}

function LimitLabel({ title, description }: { title: string; description: string }) {
  return (
    <span className={styles.LimitLabel}>
      <span className={styles.LimitTitle}>{title}</span>
      <span className={styles.LimitDescription}>{description}</span>
    </span>
  );
}

export function ExportSettings() {
  const { t } = useTranslation('admin');
  const { themeConfig, saveExportLimits } = useTheme();
  const { maxAreaM2, maxObservations, maxRasterLayers, exemptAdmins }: Partial<ExportLimits> = themeConfig.exportLimits ?? {};

  const [enabled, setEnabled] = useState<Record<Limit, boolean>>({
    area: isSet(maxAreaM2),
    observations: isSet(maxObservations),
    rasterLayers: isSet(maxRasterLayers),
  });
  const [values, setValues] = useState<Record<Limit, string>>({
    area: isSet(maxAreaM2) ? String(maxAreaM2 / M2_PER_KM2) : '',
    observations: isSet(maxObservations) ? String(maxObservations) : '',
    rasterLayers: isSet(maxRasterLayers) ? String(maxRasterLayers) : '',
  });
  const [isAdminExempt, setIsAdminExempt] = useState<boolean>(exemptAdmins === true);

  const errors = Object.fromEntries(LIMITS.map(({ key, isInteger }) => [key, enabled[key] && !isValid(values[key], isInteger)])) as Record<
    Limit,
    boolean
  >;
  const hasErrors = Object.values(errors).some(Boolean);
  const hasLimit = Object.values(enabled).some(Boolean);

  const onSave = useCallback(() => {
    const limitValue = (key: Limit) => (enabled[key] ? Number(values[key]) : null);
    const area = limitValue('area');
    saveExportLimits({
      maxAreaM2: area === null ? null : Math.round(area * M2_PER_KM2),
      maxObservations: limitValue('observations'),
      maxRasterLayers: limitValue('rasterLayers'),
      exemptAdmins: hasLimit && isAdminExempt,
    });
  }, [enabled, values, hasLimit, isAdminExempt, saveExportLimits]);

  return (
    <div className={styles.Layout}>
      <div className={styles.ContentWrapper}>
        <main className={styles.Content}>
          <div className={styles.TextBlock}>
            <h3 className={styles.Title}>{t('export_settings.subtitle')}</h3>
            <p className={styles.Subtitle}>{t('export_settings.description')}</p>
          </div>
          <div className={styles.Limits}>
            {LIMITS.map(({ key, i18nKey, isInteger }) => (
              <div key={key} className={styles.Limit}>
                <Checkbox
                  name={key}
                  value={enabled[key]}
                  label={
                    <LimitLabel title={t(`export_settings.${i18nKey}.label`)} description={t(`export_settings.${i18nKey}.description`)} />
                  }
                  onChange={checked => setEnabled(prev => ({ ...prev, [key]: checked }))}
                />
                <TextInput
                  className={styles.LimitInput}
                  type="number"
                  name={key}
                  value={values[key]}
                  isDisabled={!enabled[key]}
                  isError={errors[key]}
                  errorMessage={t(isInteger ? 'export_settings.errors.positive_integer' : 'export_settings.errors.positive_number')}
                  onChange={value => setValues(prev => ({ ...prev, [key]: value }))}
                />
              </div>
            ))}
            <div className={styles.Limit}>
              <Checkbox
                name="exemptAdmins"
                value={hasLimit && isAdminExempt}
                isDisabled={!hasLimit}
                label={
                  <LimitLabel
                    title={t('export_settings.exempt_admins.label')}
                    description={t('export_settings.exempt_admins.description')}
                  />
                }
                onChange={checked => setIsAdminExempt(checked)}
              />
            </div>
          </div>
        </main>
        <div className={styles.Footer}>
          <Button isDisabled={hasErrors} onClick={onSave}>
            {t('export_settings.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
