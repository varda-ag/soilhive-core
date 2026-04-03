/* SoilDataFileRow.tsx */
import { useTranslation } from 'react-i18next';
import { AutoComplete } from 'primereact/autocomplete';
import { Button } from 'components/UI'; // Use your internal component
import classnames from 'classnames';
import styles from './SoilDataFileRow.module.scss';
import { type SoilDataFile } from '../../../../types/soilDataFile';
import CrossIcon from 'assets/icons/cross-icon.svg?react';

// Hardcoded CRS options — to be replaced with an API call in a future iteration
const CRS_OPTIONS = ['EPSG:2154', 'EPSG:27700'];

interface Props {
  soilDataFile: SoilDataFile;
  onCrsChange: (fileId: string, crs: string) => void;
  onRemove: (fileId: string) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Kb`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mb`;
}

export function SoilDataFileRow({ soilDataFile, onCrsChange, onRemove }: Props) {
  const { t } = useTranslation('admin');
  const { id, file, crs } = soilDataFile;

  const suggestions = CRS_OPTIONS.filter(option => !crs || option.toLowerCase().includes(crs.toLowerCase()));

  return (
    <div className={styles.Container}>
      <div className={classnames(styles.SoilDataFileRow)}>
        <div className={styles.FileInfo}>
          <div className={styles.FileName}>{file.name}</div>
          <div className={styles.FileSize}>{formatFileSize(file.size)}</div>
        </div>

        <div className={styles.CrsSection}>
          <label className={styles.CrsLabel} htmlFor={`crs-${id}`}>
            {t('datasets.soil_data.crs_label')}
          </label>
          <AutoComplete
            inputId={`crs-${id}`}
            value={crs ?? ''}
            suggestions={suggestions}
            completeMethod={() => {}}
            onChange={e => onCrsChange(id, e.value)}
            placeholder={t('datasets.soil_data.crs_placeholder')}
            className={styles.CrsDropdown}
            inputClassName={styles.CrsInput}
            panelClassName={styles.CrsPanel}
            dropdown
          />
        </div>

        <Button type="tertiary" size="tiny" onClick={() => onRemove(id)} isIconOnly>
          <CrossIcon className={styles.RemoveButtonIcon} />
        </Button>
      </div>
    </div>
  );
}
