import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './RelatedResourcesRow.module.scss';
import { Button, TextInput } from 'components/UI';
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

function ResourceItem({ url, onRemove }: { url: string; onRemove?: () => void }) {
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
  onChange,
}: {
  label: string;
  value: string[] | undefined | null;
  isEditable: boolean;
  property: string;
  displayPlaceholder?: string;
  disableBackground?: boolean;
  onChange: (property: string, value: string[]) => void;
}) {
  const { t } = useTranslation('metadata');
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || !isValidUrl(trimmed)) return;
    onChange(property, [...(value ?? []), trimmed]);
    setInputValue('');
  };

  const handleRemove = (index: number) => {
    onChange(
      property,
      (value ?? []).filter((_, i) => i !== index),
    );
  };

  return (
    <div
      className={[styles.Row, isEditable ? styles.RowAdmin : '', disableBackground ? styles.RowNoBackground : ''].filter(Boolean).join(' ')}
    >
      <p className={styles.Label}>
        <strong>{label}</strong>
      </p>
      {isEditable ? (
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
                placeholder={t('editor.url_placeholder')}
                isError={!!inputValue.trim() && !isValidUrl(inputValue)}
                errorMessage={t('editor.invalid_url')}
              />
              <Button size="small" type="secondary" onClick={handleAdd} isDisabled={!inputValue.trim() || !isValidUrl(inputValue)}>
                {t('editor.add')}
              </Button>
            </form>
            {value && value.length > 0 && (
              <div className={styles.AddedResources}>
                <p className={styles.AddedResourcesTitle}>{t('editor.added_resources')}</p>
                <ul className={styles.ResourceList}>
                  {value.map((url, i) => (
                    <ResourceItem key={i} url={url} onRemove={() => handleRemove(i)} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      ) : (
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
      )}
    </div>
  );
}
