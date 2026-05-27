import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Editor, type EditorTextChangeEvent } from 'primereact/editor';
import { type SaveCallbacks } from 'hooks/useMetadata';
import useNotifications from 'hooks/useNotifications';
import { EDITOR_HEADER } from 'configuration/editor';
import styles from './EditorRow.module.scss';
import { Button, TextInput } from 'components/UI';
import { htmlDisplay } from 'utilities/isomorphicHTMLDisplay';
import EditIcon from 'assets/icons/pencil-icon.svg?react';

export function EditorRow({
  label,
  value,
  isEditable,
  property,
  variant = 'editor',
  placeholder,
  onStartEditing,
  onSave,
  onCancel,
}: {
  label: string;
  value: string | undefined | null;
  isEditable: boolean;
  property: string;
  variant?: 'editor' | 'text';
  placeholder?: string;
  onStartEditing: (property: string) => void;
  onSave: (property: string, value: string, callbacks: SaveCallbacks) => void;
  onCancel: (property: string) => void;
}) {
  const { t } = useTranslation('metadata');
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
        <div className={`${styles.EditArea}${isSaving ? ` ${styles.EditAreaSaving}` : ''}`}>
          {variant === 'text' ? (
            <div className={styles.TextInputWrapper}>
              <TextInput size="small" value={editValue} onChange={v => setEditValue(v)} isDisabled={isSaving} placeholder={placeholder} />
            </div>
          ) : (
            <div className={styles.EditorWrapper}>
              <Editor
                value={editValue}
                onTextChange={(e: EditorTextChangeEvent) => setEditValue(e.htmlValue ?? '')}
                headerTemplate={EDITOR_HEADER}
                readOnly={isSaving}
                placeholder={placeholder}
              />
            </div>
          )}
          <div className={styles.EditActions}>
            <Button size="small" onClick={handleSave} isDisabled={isSaving}>
              {isSaving ? t('editor.saving') : t('editor.save')}
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
              {t('editor.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.Text}>{variant === 'text' ? value : htmlDisplay(value)}</div>
          {isEditable && (
            <button
              type="button"
              className={styles.EditButton}
              onClick={() => {
                setEditValue(value ?? '');
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
