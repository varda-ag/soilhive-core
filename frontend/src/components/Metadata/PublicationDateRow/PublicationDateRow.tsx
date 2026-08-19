import { Calendar } from 'primereact/calendar';
import type { Nullable } from 'primereact/ts-helpers';
import { dateStringToYYYYMMDD } from 'utilities/date';
import styles from './PublicationDateRow.module.scss';

function parseToDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const parts = value.trim().split('-').map(Number);
  if (parts.length === 3 && parts.every(n => !isNaN(n))) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  return null;
}

export function PublicationDateRow({
  label,
  value,
  isEditable,
  property,
  isRequired,
  hasError,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  isEditable: boolean;
  property: string;
  isRequired?: boolean;
  hasError?: boolean;
  onChange: (property: string, value: string) => void;
}) {
  const selectedDate: Nullable<Date> = parseToDate(value);

  const handleDateChange = (date: Nullable<Date>) => {
    onChange(property, date ? dateStringToYYYYMMDD(date) : '');
  };

  return (
    <div className={[styles.Row, isEditable ? styles.RowAdmin : ''].filter(Boolean).join(' ')}>
      <p className={styles.Label}>
        <strong>
          {label}
          {isRequired && <sup>*</sup>}
        </strong>
      </p>
      {isEditable ? (
        <div className={styles.EditArea}>
          <div className={[styles.CalendarWrapper, hasError ? styles.CalendarWrapperError : ''].filter(Boolean).join(' ')}>
            <Calendar
              className={styles.Calendar}
              inputClassName={styles.CalendarInput}
              value={selectedDate}
              onChange={e => handleDateChange(e.value as Nullable<Date>)}
              dateFormat="yy-mm-dd"
              placeholder="YYYY-MM-DD"
              showIcon
              readOnlyInput
            />
          </div>
        </div>
      ) : (
        <div className={styles.Text}>{value ?? ''}</div>
      )}
    </div>
  );
}
