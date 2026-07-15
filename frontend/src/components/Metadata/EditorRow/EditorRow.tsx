import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Editor, type EditorTextChangeEvent } from 'primereact/editor';
import { type SaveCallbacks } from 'hooks/useMetadata';
import useNotifications from 'hooks/useNotifications';
import { EDITOR_HEADER } from 'configuration/editor';
import styles from './EditorRow.module.scss';
import { Button, TextInput } from 'components/UI';
import { htmlDisplay } from 'utilities/isomorphicHTMLDisplay';
import { isEmptyString, hasTextContent } from 'utilities/validation';
import EditIcon from 'assets/icons/pencil-icon.svg?react';

export function EditorRow({
  label,
  value,
  isEditable,
  property,
  variant = 'editor',
  placeholder,
  displayPlaceholder,
  disableBackground,
  isRequired,
  onStartEditing,
  onSave,
  onCancel,
}: {
  label: string;
  value: string | undefined | null;
  isEditable: boolean;
  property: string;
  variant?: 'editor' | 'text';
  /** Text shown inside the editor/input while the user is typing and the field is empty. Only visible in edit mode. */
  placeholder?: string;
  /** Text shown in view mode when the field has no value. Replaces the empty display area so the row never looks blank. */
  displayPlaceholder?: string;
  disableBackground?: boolean;
  isRequired?: boolean;
  onStartEditing: (property: string) => void;
  onSave: (property: string, value: string, callbacks: SaveCallbacks) => void;
  onCancel: (property: string) => void;
}) {
  const { t } = useTranslation('metadata');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editValue, setEditValue] = useState(value ?? '');

  const { showNotification } = useNotifications();

  const isSaveDisabled = isRequired ? (variant === 'editor' ? !hasTextContent(editValue) : isEmptyString(editValue)) : false;

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
    <div
      className={[styles.Row, isEditable && !isEditing ? styles.RowAdmin : '', disableBackground ? styles.RowNoBackground : '']
        .filter(Boolean)
        .join(' ')}
    >
      <p className={styles.Label}>
        <strong>
          {label}
          {isRequired && <sup>*</sup>}
        </strong>
      </p>
      {isEditing ? (
        <div className={styles.EditArea}>
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
            <Button size="small" onClick={handleSave} isDisabled={isSaving || isSaveDisabled}>
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
          <div className={styles.Text}>{value ? (variant === 'text' ? value : htmlDisplay(value)) : displayPlaceholder}</div>
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
