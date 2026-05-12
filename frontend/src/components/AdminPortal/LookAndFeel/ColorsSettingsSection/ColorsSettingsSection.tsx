import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from 'components/UI';
import { ColorsSettingsField } from 'components/AdminPortal/LookAndFeel/ColorsSettingsField/ColorsSettingsField';
import useLookAndFeel from 'hooks/useLookAndFeel';
import type { ColorsConfigField, ColorsConfigSection } from 'types/config';

import styles from './ColorsSettingsSection.module.scss';

export function ColorsSettingsSection({ name, fields, applyPrimary, applySecondary }: ColorsConfigSection) {
  const { t } = useTranslation('admin');
  const { colors, handleColorChange } = useLookAndFeel();

  const onApplyPrimary = useCallback(
    (fields: ColorsConfigField[]) => {
      handleColorChange(fields[0].name, colors['primary-default']);
      handleColorChange(fields[1].name, colors['primary-hover']);

      if (fields[2]) {
        handleColorChange(fields[2].name, colors['primary-text']);
      }
    },
    [colors, handleColorChange],
  );

  const onApplySecondary = useCallback(
    (fields: ColorsConfigField[]) => {
      handleColorChange(fields[0].name, colors['secondary-default']);
      handleColorChange(fields[1].name, colors['secondary-hover']);
    },
    [colors, handleColorChange],
  );

  return (
    <div className={styles.ColorsSettingsSection}>
      <h3 className={styles.Title}>{t(`look_and_feel.colors.sections.${name}.title`)}</h3>
      {(applyPrimary || applySecondary) && (
        <div className={styles.Actions}>
          {applyPrimary && (
            <Button className={styles.ActionButton} type="custom" size="tiny" onClick={() => onApplyPrimary(fields)}>
              {t(`look_and_feel.colors.sections.${name}.apply_primary`)}
            </Button>
          )}
          {applySecondary && (
            <Button className={styles.ActionButton} type="custom" size="tiny" onClick={() => onApplySecondary(fields)}>
              {t(`look_and_feel.colors.sections.${name}.apply_secondary`)}
            </Button>
          )}
        </div>
      )}
      <div className={styles.Row}>
        {fields.map(field => (
          <ColorsSettingsField
            key={field.name}
            label={t(`look_and_feel.colors.fields.${field.name}.label`)}
            initialValue={colors[field.name]}
            tooltipLabel={field.tooltip ? t(`look_and_feel.colors.fields.${field.name}.tooltip_label`) : undefined}
            tooltipText={field.tooltip ? t(`look_and_feel.colors.fields.${field.name}.tooltip_text`) : undefined}
            name={field.name}
            onChange={handleColorChange}
          />
        ))}
      </div>
    </div>
  );
}
