/* SoilDataFileRow.tsx */
import { useTranslation } from 'react-i18next';
import { AutoComplete, type AutoCompleteCompleteEvent } from 'primereact/autocomplete';
import { Button } from 'components/UI'; // Use your internal component
import classnames from 'classnames';
import styles from './SoilDataFileRow.module.scss';
import { type SoilDataFile } from '../../../../types/soilDataFile';
import CrossIcon from 'assets/icons/cross-icon.svg?react';
import { useState } from 'react';

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
  const { id, name, file, crs, inferredCrs } = soilDataFile;
  const [filteredCrs, setFilteredCrs] = useState<string[]>([]);

  const isReadOnly = !!inferredCrs;

  const filterCrsOptions = (e: AutoCompleteCompleteEvent) => {
    const query = e.query;
    if (query && /\d/.test(query)) {
      // single digit --> start filtering
      setFilteredCrs(crsOptions.map(n => `EPSG:${n}`).filter(option => option.toLowerCase().includes(query.toLowerCase())));
    } else {
      setFilteredCrs([]);
    }
  };

  const handleBlur = () => {
    const validValues = crsOptions.map(n => `EPSG:${n}`);
    if (crs && !validValues.includes(crs)) {
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
            inputId={`crs-${id}`}
            value={crs ?? ''}
            suggestions={filteredCrs}
            completeMethod={filterCrsOptions}
            onChange={e => onCrsChange(id, e.value)}
            placeholder={t('datasets.soil_data.crs_placeholder')}
            className={styles.CrsDropdown}
            inputClassName={styles.CrsInput}
            panelClassName={styles.CrsPanel}
            dropdown={false}
            disabled={isReadOnly}
            onBlur={handleBlur}
          />
        </div>

        <Button type="tertiary" size="tiny" onClick={() => onRemove(id)} isIconOnly>
          <CrossIcon className={styles.RemoveButtonIcon} />
        </Button>
      </div>
    </div>
  );
}
