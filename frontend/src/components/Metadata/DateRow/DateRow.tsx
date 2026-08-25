import { useState, useEffect, useRef } from 'react';
import { Calendar } from 'primereact/calendar';
import type { Nullable } from 'primereact/ts-helpers';
import { useTranslation } from 'react-i18next';
import styles from './DateRow.module.scss';

type Granularity = 'year' | 'month' | 'date';

function detectGranularity(value: string | null | undefined): Granularity {
  if (!value?.trim()) return 'date';
  const parts = value.trim().split('-');
  if (parts.length === 1) return 'year';
  if (parts.length === 2) return 'month';
  return 'date';
}

function parseToDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const parts = value.trim().split('-').map(Number);
  if (parts.length >= 1 && !isNaN(parts[0])) {
    return new Date(parts[0], (parts[1] ?? 1) - 1, parts[2] ?? 1);
  }
  return null;
}

function formatDate(date: Date, granularity: Granularity): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  if (granularity === 'year') return `${y}`;
  if (granularity === 'month') return `${y}-${m}`;
  return `${y}-${m}-${d}`;
}

function dateFormatFor(granularity: Granularity): string {
  if (granularity === 'year') return 'yy';
  if (granularity === 'month') return 'yy-mm';
  return 'yy-mm-dd';
}

function placeholderFor(granularity: Granularity): string {
  if (granularity === 'year') return 'YYYY';
  if (granularity === 'month') return 'YYYY-MM';
  return 'YYYY-MM-DD';
}

export function DateRow({
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
  const { t } = useTranslation('metadata');
  const [granularity, setGranularity] = useState<Granularity>(() => detectGranularity(value));
  const initialized = useRef(!!value);

  useEffect(() => {
    if (!initialized.current && value) {
      initialized.current = true;
      setGranularity(detectGranularity(value));
    }
  }, [value]);

  const selectedDate: Nullable<Date> = parseToDate(value);

  const handleDateChange = (date: Nullable<Date>) => {
    onChange(property, date ? formatDate(date, granularity) : '');
  };

  const handleGranularityChange = (next: Granularity) => {
    initialized.current = true;
    setGranularity(next);
    if (selectedDate) {
      onChange(property, formatDate(selectedDate, next));
    }
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
              key={granularity}
              className={styles.Calendar}
              inputClassName={styles.CalendarInput}
              value={selectedDate}
              onChange={e => handleDateChange(e.value as Nullable<Date>)}
              view={granularity}
              dateFormat={dateFormatFor(granularity)}
              placeholder={placeholderFor(granularity)}
              showIcon
              readOnlyInput
            />
          </div>
          <div className={styles.GranularityToggle}>
            <button
              type="button"
              className={[styles.GranularityBtn, granularity === 'year' ? styles.GranularityBtnActive : ''].filter(Boolean).join(' ')}
              onClick={() => handleGranularityChange('year')}
            >
              {t('editor.granularity_year')}
            </button>
            <button
              type="button"
              className={[styles.GranularityBtn, granularity === 'month' ? styles.GranularityBtnActive : ''].filter(Boolean).join(' ')}
              onClick={() => handleGranularityChange('month')}
            >
              {t('editor.granularity_year_month')}
            </button>
            <button
              type="button"
              className={[styles.GranularityBtn, granularity === 'date' ? styles.GranularityBtnActive : ''].filter(Boolean).join(' ')}
              onClick={() => handleGranularityChange('date')}
            >
              {t('editor.granularity_full_date')}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.Text}>{value ?? ''}</div>
      )}
    </div>
  );
}
