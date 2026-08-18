import { Editor, type EditorTextChangeEvent } from 'primereact/editor';
import { EDITOR_HEADER } from 'configuration/editor';
import styles from './EditorRow.module.scss';
import { TextInput } from 'components/UI';
import { htmlDisplay } from 'utilities/isomorphicHTMLDisplay';

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
  hasError,
  onChange,
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
  hasError?: boolean;
  onChange: (property: string, value: string) => void;
}) {
  return (
    <div
      className={[styles.Row, isEditable ? styles.RowAdmin : '', disableBackground ? styles.RowNoBackground : ''].filter(Boolean).join(' ')}
    >
      <p className={styles.Label}>
        <strong>
          {label}
          {isRequired && <sup>*</sup>}
        </strong>
      </p>
      {isEditable ? (
        <div className={styles.EditArea}>
          {variant === 'text' ? (
            <div className={styles.TextInputWrapper}>
              <TextInput
                size="small"
                value={value ?? ''}
                onChange={v => onChange(property, v)}
                placeholder={placeholder}
                isError={hasError}
              />
            </div>
          ) : (
            <div className={[styles.EditorWrapper, hasError ? styles.EditorWrapperError : ''].filter(Boolean).join(' ')}>
              <Editor
                value={value ?? ''}
                onTextChange={(e: EditorTextChangeEvent) => onChange(property, e.htmlValue ?? '')}
                headerTemplate={EDITOR_HEADER}
                placeholder={placeholder}
              />
            </div>
          )}
        </div>
      ) : (
        <div className={styles.Text}>{value ? (variant === 'text' ? value : htmlDisplay(value)) : displayPlaceholder}</div>
      )}
    </div>
  );
}
