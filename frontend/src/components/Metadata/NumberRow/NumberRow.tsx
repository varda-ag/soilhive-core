import { useState } from 'react';
import { type SaveCallbacks } from 'hooks/useMetadata';
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
  onStartEditing: (property: string) => void;
  onSave: (property: string, value: string, callbacks: SaveCallbacks) => void;
  onCancel: (property: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editValue, setEditValue] = useState(value?.toString() ?? '');

  const handleSave = () => {
    setIsSaving(true);
    onSave(property, editValue, {
      onSuccess: () => {
        setIsEditing(false);
        setIsSaving(false);
      },
      onError: () => setIsSaving(false),
    });
  };

  return (
    <div className={`${styles.Row}${isEditable && !isEditing ? ` ${styles.RowAdmin}` : ''}`}>
      <p className={styles.Label}>
        <strong>{label}</strong>
      </p>
      {isEditing ? (
        <div className={`${styles.EditArea}${isSaving ? ` ${styles.EditAreaSaving}` : ''}`}>
          <div className={styles.EditorWrapper}>
            <TextInput
              type="number"
              size="small"
              value={editValue}
              onChange={v => setEditValue(v)}
              isDisabled={isSaving}
              placeholder={min !== undefined && max !== undefined ? `${min}–${max}` : undefined}
            />
          </div>
          <div className={styles.EditActions}>
            <Button size="small" onClick={handleSave} isDisabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save'}
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
              Cancel
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
              aria-label="Edit"
            >
              <EditIcon />
            </button>
          )}
        </>
      )}
    </div>
  );
}
