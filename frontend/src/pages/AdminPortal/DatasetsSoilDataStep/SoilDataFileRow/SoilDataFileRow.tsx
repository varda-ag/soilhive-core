/* SoilDataFileRow.tsx */
import { useTranslation } from 'react-i18next';
import { AutoComplete, type AutoCompleteCompleteEvent } from 'primereact/autocomplete';
import { Button, FormMessage, Dialog } from 'components/UI';
import classnames from 'classnames';
import styles from './SoilDataFileRow.module.scss';
import { type SoilDataFile } from '../../../../types/soilDataFile';
import CrossIcon from 'assets/icons/cross-icon.svg?react';
import QuestionIcon from 'assets/icons/question-round-icon.svg?react';
import { useMemo, useRef, useState } from 'react';

interface Props {
  soilDataFile: SoilDataFile;
  onCrsChange: (fileId: string, crs: string) => void;
  onRemove: (fileId: string) => void;
  crsOptions: number[];
}

function formatFileSize(bytes: number | undefined): string {
  if (bytes === undefined) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mb`;
}

export function SoilDataFileRow({ soilDataFile, onCrsChange, onRemove, crsOptions }: Props) {
  const { t } = useTranslation('admin');
  const { id, name, file, crs, inferredCrs, error, missingFields, extraFields } = soilDataFile;
  const [filteredCrs, setFilteredCrs] = useState<string[]>([]);
  const [diffOpen, setDiffOpen] = useState(false);
  const autoCompleteRef = useRef<AutoComplete>(null);
  // PrimeReact refocuses the input after a selection; this flag keeps that programmatic focus from reopening the panel
  const skipNextFocusOpen = useRef(false);

  const isReadOnly = !!inferredCrs;

  const allCrsOptions = useMemo(() => crsOptions.map(n => `EPSG:${n}`), [crsOptions]);

  const filterCrsOptions = (e: AutoCompleteCompleteEvent) => {
    const query = e.query.trim().toLowerCase();
    setFilteredCrs(query ? allCrsOptions.filter(option => option.toLowerCase().includes(query)) : [...allCrsOptions]);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (skipNextFocusOpen.current) {
      skipNextFocusOpen.current = false;
      return;
    }
    autoCompleteRef.current?.search(e, e.target.value, 'dropdown');
  };

  const handleBlur = () => {
    skipNextFocusOpen.current = false;
    if (crs && !allCrsOptions.includes(crs)) {
      onCrsChange(id, inferredCrs ?? '');
    }
  };

  return (
    <div className={styles.Container}>
      <div className={classnames(styles.SoilDataFileRow)}>
        <div className={styles.FileInfo}>
          <div className={styles.FileName}>{name}</div>
          <div className={styles.FileSize}>{formatFileSize(file?.size)}</div>
        </div>

        <div className={styles.CrsSection}>
          <label className={styles.CrsLabel} htmlFor={`crs-${id}`}>
            {t('datasets.soil_data.crs_label')}
          </label>
          <AutoComplete
            ref={autoCompleteRef}
            inputId={`crs-${id}`}
            value={crs ? crs : (inferredCrs ?? '')}
            suggestions={filteredCrs}
            completeMethod={filterCrsOptions}
            virtualScrollerOptions={{ itemSize: 38 }}
            onChange={e => onCrsChange(id, e.value)}
            onSelect={() => {
              skipNextFocusOpen.current = true;
            }}
            placeholder={t('datasets.soil_data.crs_placeholder')}
            className={styles.CrsDropdown}
            inputClassName={styles.CrsInput}
            panelClassName={styles.CrsPanel}
            dropdown={false}
            disabled={isReadOnly}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>

        <Button type="tertiary" size="tiny" onClick={() => onRemove(id)} isIconOnly>
          <CrossIcon className={styles.RemoveButtonIcon} />
        </Button>
      </div>
      {error && (
        <div className={styles.ErrorRow}>
          <FormMessage message={error} type="error" />
          <Button
            type="custom"
            size="tiny"
            isIconOnly
            className={styles.DiffButton}
            dataTestId="sh-diff-button"
            onClick={() => setDiffOpen(true)}
          >
            <QuestionIcon />
          </Button>
        </div>
      )}
      <Dialog
        visible={diffOpen}
        header={t('datasets.soil_data.diff_dialog.header')}
        primaryText={t('common:close')}
        onPrimary={() => setDiffOpen(false)}
        onSecondary={() => setDiffOpen(false)}
      >
        <div className={styles.DiffContent}>
          {!!missingFields?.length && (
            <div className={styles.DiffSection}>
              <p className={styles.DiffSectionTitle}>{t('datasets.soil_data.diff_dialog.missing_fields')}</p>
              <ul className={styles.DiffList}>
                {missingFields.map(field => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </div>
          )}
          {!!extraFields?.length && (
            <div className={styles.DiffSection}>
              <p className={styles.DiffSectionTitle}>{t('datasets.soil_data.diff_dialog.extra_fields')}</p>
              <ul className={styles.DiffList}>
                {extraFields.map(field => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
