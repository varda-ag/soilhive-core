import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type SaveCallbacks } from 'hooks/useMetadata';
import useNotifications from 'hooks/useNotifications';
import styles from './RelatedResourcesRow.module.scss';
import { Button, TextInput } from 'components/UI';
import EditIcon from 'assets/icons/pencil-icon.svg?react';
import CrossIcon from 'assets/icons/cross-icon.svg?react';
import ChainIcon from 'assets/icons/chain-icon.svg?react';

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function ResourceItem({ url, onRemove, isSaving }: { url: string; onRemove?: () => void; isSaving?: boolean }) {
  const { t } = useTranslation('metadata');
  return (
    <li className={styles.ResourceItem}>
      <a href={url} target="_blank" rel="noreferrer">
        <ChainIcon width={24} height={24} className={styles.ChainIcon} />
        <span className={styles.ResourceUrl}>{url}</span>
        <span className={styles.ResourceType}>Link</span>
        {onRemove && (
          <button
            type="button"
            className={styles.RemoveButton}
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }}
            disabled={isSaving}
            aria-label={t('editor.remove_resource_aria')}
          >
            <CrossIcon width={24} height={24} />
          </button>
        )}
      </a>
    </li>
  );
}

export function RelatedResourcesRow({
  label,
  value,
  isEditable,
  property,
  displayPlaceholder,
  disableBackground,
  onStartEditing,
  onSave,
  onCancel,
}: {
  label: string;
  value: string[] | undefined | null;
  isEditable: boolean;
  property: string;
  displayPlaceholder?: string;
  disableBackground?: boolean;
  onStartEditing: (property: string) => void;
  onSave: (property: string, value: string[], callbacks: SaveCallbacks) => void;
  onCancel: (property: string) => void;
}) {
  const { t } = useTranslation('metadata');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editValues, setEditValues] = useState<string[]>(value ?? []);
  const [inputValue, setInputValue] = useState('');

  const { showNotification } = useNotifications();

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setEditValues(prev => [...prev, trimmed]);
    setInputValue('');
  };

  const handleRemove = (index: number) => {
    setEditValues(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    setIsSaving(true);
    onSave(property, editValues, {
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
        <strong>{label}</strong>
      </p>
      {isEditing ? (
        <div className={styles.EditArea}>
          <div className={styles.EditContent}>
            <p className={styles.AddLinkLabel}>
              <ChainIcon width={16} height={16} className={styles.ChainIcon} />
              {t('editor.add_link')}
            </p>
            <form
              className={styles.AddRow}
              onSubmit={e => {
                e.preventDefault();
                handleAdd();
              }}
            >
              <TextInput
                size="small"
                value={inputValue}
                onChange={v => setInputValue(v)}
                isDisabled={isSaving}
                placeholder={t('editor.url_placeholder')}
                isError={!!inputValue.trim() && !isValidUrl(inputValue)}
                errorMessage={t('editor.invalid_url')}
              />
              <Button
                size="small"
                type="secondary"
                onClick={handleAdd}
                isDisabled={isSaving || !inputValue.trim() || !isValidUrl(inputValue)}
              >
                {t('editor.add')}
              </Button>
            </form>
            {editValues.length > 0 && (
              <div className={styles.AddedResources}>
                <p className={styles.AddedResourcesTitle}>{t('editor.added_resources')}</p>
                <ul className={styles.ResourceList}>
                  {editValues.map((url, i) => (
                    <ResourceItem key={i} url={url} onRemove={() => handleRemove(i)} isSaving={isSaving} />
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className={styles.EditActions}>
            <Button size="small" onClick={handleSave} isDisabled={isSaving}>
              {isSaving ? t('editor.saving') : t('editor.save')}
            </Button>
            <Button
              type="secondary"
              size="small"
              onClick={() => {
                setEditValues(value ?? []);
                setInputValue('');
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
          <div className={styles.Text}>
            {value && value.length > 0 ? (
              <ul className={styles.ResourceList}>
                {value.map((url, i) => (
                  <ResourceItem key={i} url={url} />
                ))}
              </ul>
            ) : (
              displayPlaceholder
            )}
          </div>
          {isEditable && (
            <button
              type="button"
              className={styles.EditButton}
              onClick={() => {
                setEditValues(value ?? []);
                setInputValue('');
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
