import styles from './NumberRow.module.scss';
import { TextInput } from 'components/UI';

export function NumberRow({
  label,
  value,
  isEditable,
  property,
  min,
  max,
  isRequired,
  hasError,
  onChange,
}: {
  label: string;
  value: number | undefined | null;
  isEditable: boolean;
  property: string;
  min?: number;
  max?: number;
  isRequired?: boolean;
  hasError?: boolean;
  onChange: (property: string, value: string) => void;
}) {
  return (
    <div className={`${styles.Row}${isEditable ? ` ${styles.RowAdmin}` : ''}`}>
      <p className={styles.Label}>
        <strong>
          {label}
          {isRequired && <sup>*</sup>}
        </strong>
      </p>
      {isEditable ? (
        <div className={styles.EditArea}>
          <div className={styles.EditorWrapper}>
            <TextInput
              type="number"
              size="small"
              value={value?.toString() ?? ''}
              onChange={v => onChange(property, v)}
              placeholder={min !== undefined && max !== undefined ? `${min}–${max}` : undefined}
              isError={hasError}
            />
          </div>
        </div>
      ) : (
        <div className={styles.Text}>{value ?? ''}</div>
      )}
    </div>
  );
}
