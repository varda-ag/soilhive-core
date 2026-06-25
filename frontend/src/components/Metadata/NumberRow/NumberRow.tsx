import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type SaveCallbacks } from 'hooks/useMetadata';
import useNotifications from 'hooks/useNotifications';
import { isEmptyString } from 'utilities/validation';
import styles from './NumberRow.module.scss';
import { Button, TextInput } from 'components/UI';
import EditIcon from 'assets/icons/pencil-icon.svg?react';

export function NumberRow({
  label,
  value,
  isEditable,
  property,
  min,
  max,
  isRequired,
  onStartEditing,
  onSave,
  onCancel,
}: {
  label: string;
  value: number | undefined | null;
  isEditable: boolean;
  property: string;
  min?: number;
  max?: number;
  isRequired?: boolean;
  onStartEditing: (property: string) => void;
  onSave: (property: string, value: string, callbacks: SaveCallbacks) => void;
  onCancel: (property: string) => void;
}) {
  const { t } = useTranslation('metadata');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editValue, setEditValue] = useState(value?.toString() ?? '');
  const [error, setError] = useState('');

  const { showNotification } = useNotifications();

  const handleSave = () => {
    if (isRequired && isEmptyString(editValue)) {
      setError(t('editor.field_required'));
      return;
    }
    setIsSaving(true);
    onSave(property, editValue, {
      onSuccess: () => {
        setIsEditing(false);
        setIsSaving(false);
      },
      onError: error => {
        setIsSaving(false);
        showNotification({
          id: `${property}-save-error`,
          title: t('editor.failed_to_save'),
          message: error.message,
          type: 'error',
        });
      },
    });
  };

  return (
    <div className={`${styles.Row}${isEditable && !isEditing ? ` ${styles.RowAdmin}` : ''}`}>
      <p className={styles.Label}>
        <strong>{label}</strong>
      </p>
      {isEditing ? (
        <div className={styles.EditArea}>
          <div className={styles.EditorWrapper}>
            <TextInput
              type="number"
              size="small"
              value={editValue}
              onChange={v => {
                setEditValue(v);
                setError('');
              }}
              isDisabled={isSaving}
              placeholder={min !== undefined && max !== undefined ? `${min}–${max}` : undefined}
              isError={!!error}
              errorMessage={error}
            />
          </div>
          <div className={styles.EditActions}>
            <Button size="small" onClick={handleSave} isDisabled={isSaving}>
              {isSaving ? t('editor.saving') : t('editor.save')}
            </Button>
            <Button
              type="secondary"
              size="small"
              onClick={() => {
                setEditValue(value?.toString() ?? '');
                setIsEditing(false);
                onCancel(property);
              }}
              isDisabled={isSaving}
            >
              {t('editor.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.Text}>{value ?? ''}</div>
          {isEditable && (
            <button
              type="button"
              className={styles.EditButton}
              onClick={() => {
                setEditValue(value?.toString() ?? '');
                setIsEditing(true);
                onStartEditing(property);
              }}
              aria-label={t('editor.edit_aria')}
            >
              <EditIcon />
            </button>
          )}
        </>
      )}
    </div>
  );
}
