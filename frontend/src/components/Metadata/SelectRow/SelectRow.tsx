import { useState } from 'react';
import { type SaveCallbacks } from 'hooks/useMetadata';
import useNotifications from 'hooks/useNotifications';
import styles from './SelectRow.module.scss';
import { Button, Dropdown } from 'components/UI';
import EditIcon from 'assets/icons/pencil-icon.svg?react';

export function SelectRow({
  label,
  value,
  options,
  isEditable,
  property,
  onStartEditing,
  onSave,
  onCancel,
}: {
  label: string;
  value: string | undefined | null;
  options: { code: string; name: string }[];
  isEditable: boolean;
  property: string;
  onStartEditing: (property: string) => void;
  onSave: (property: string, value: string, callbacks: SaveCallbacks) => void;
  onCancel: (property: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editValue, setEditValue] = useState(value ?? '');

  const { showNotification } = useNotifications();

  const handleSave = () => {
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
          title: 'Failed to save',
          message: error.message,
          type: 'error',
        });
      },
    });
  };

  const displayLabel = options.find(o => o.code === value)?.name ?? value ?? '';

  return (
    <div className={`${styles.Row}${isEditable && !isEditing ? ` ${styles.RowAdmin}` : ''}`}>
      <p className={styles.Label}>
        <strong>{label}</strong>
      </p>
      {isEditing ? (
        <div className={`${styles.EditArea}${isSaving ? ` ${styles.EditAreaSaving}` : ''}`}>
          <div className={styles.EditorWrapper}>
            <Dropdown
              options={options}
              value={editValue}
              onChange={selected => setEditValue(selected as string)}
              isDisabled={isSaving}
              size="small"
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
                setEditValue(value ?? '');
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
          <div className={styles.Text}>{displayLabel}</div>
          {isEditable && (
            <button
              type="button"
              className={styles.EditButton}
              onClick={() => {
                setEditValue(value ?? '');
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
