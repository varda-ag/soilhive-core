import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { useCreateLicenseMutation } from 'hooks/useDatasetMutation';
import useNotifications from 'hooks/useNotifications';
import styles from './LicenseRow.module.scss';
import { Button, Dropdown, TextInput } from 'components/UI';
import { htmlDisplay } from 'utilities/isomorphicHTMLDisplay';
import type { License } from 'types/backend';

const NEW_LICENSE_CODE = '__new_license__';

export function LicenseRow({
  label,
  currentLicenseIds,
  allLicenses,
  isEditable,
  property,
  isRequired,
  hasError,
  onChange,
}: {
  label: string;
  currentLicenseIds: string[];
  allLicenses: License[];
  isEditable: boolean;
  property: string;
  isRequired?: boolean;
  hasError?: boolean;
  onChange: (property: string, value: string) => void;
}) {
  const { t } = useTranslation('metadata');
  const [selectedValue, setSelectedValue] = useState(currentLicenseIds[0] ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const firstLicenseId = currentLicenseIds[0];
  useEffect(() => {
    setSelectedValue(prev => prev || firstLicenseId || '');
  }, [firstLicenseId]);
  const [newLicenseName, setNewLicenseName] = useState('');
  const [newLicenseFullName, setNewLicenseFullName] = useState('');
  const [newLicenseUrl, setNewLicenseUrl] = useState('');

  const createLicense = useCreateLicenseMutation();
  const { showNotification } = useNotifications();
  const queryClient = useQueryClient();

  const licenseOptions = [
    ...allLicenses.map(l => ({ code: l.id, name: l.full_name ?? l.name })),
    { code: NEW_LICENSE_CODE, name: t('license_row.custom_license') },
  ];
  const currentLicenses = allLicenses.filter(l => currentLicenseIds.includes(l.id));
  const displayValue =
    currentLicenses.length > 0
      ? currentLicenses
          .map(l => {
            const label = l.full_name ?? l.name;
            return l.url ? `<a target="_blank" href=${l.url}>${label}</a>` : label;
          })
          .join(', ')
      : undefined;

  const handleDropdownChange = (selected: string) => {
    setSelectedValue(selected);
    if (selected !== NEW_LICENSE_CODE) {
      onChange(property, selected);
    }
  };

  const handleCreateLicense = () => {
    if (!newLicenseName.trim()) return;
    setIsSaving(true);
    createLicense.mutate(
      {
        name: newLicenseName.trim(),
        full_name: newLicenseFullName.trim() || undefined,
        url: newLicenseUrl.trim() || undefined,
      },
      {
        onSuccess: newLicense => {
          queryClient.invalidateQueries({ queryKey: ['licenses'] });
          onChange(property, newLicense.id);
          setSelectedValue(newLicense.id);
          setIsSaving(false);
          setNewLicenseName('');
          setNewLicenseFullName('');
          setNewLicenseUrl('');
        },
        onError: error => {
          setIsSaving(false);
          showNotification({
            id: 'license-create-error',
            title: t('license_row.failed_to_create'),
            message: error.message,
            type: 'error',
          });
        },
      },
    );
  };

  return (
    <div className={`${styles.Row}${isEditable ? ` ${styles.RowAdmin}` : ''}`}>
      <p className={styles.Label}>
        <strong>
          {label}
          {isRequired && <sup>*</sup>}
        </strong>
      </p>
      {isEditable ? (
        <div className={styles.EditArea}>
          <div className={styles.EditorWrapper}>
            <Dropdown
              options={licenseOptions}
              value={selectedValue}
              onChange={selected => handleDropdownChange(selected as string)}
              isDisabled={isSaving}
              isError={hasError}
              placeholder={t('license_row.select_placeholder')}
              size="small"
            />
            {selectedValue === NEW_LICENSE_CODE && (
              <div className={styles.NewLicenseFields}>
                <TextInput
                  label={t('license_row.name_label')}
                  placeholder={t('license_row.name_placeholder')}
                  value={newLicenseName}
                  onChange={v => setNewLicenseName(v)}
                  isDisabled={isSaving}
                  isRequired
                  size="small"
                />
                <TextInput
                  label={t('license_row.full_name_label')}
                  placeholder={t('license_row.full_name_placeholder')}
                  value={newLicenseFullName}
                  onChange={v => setNewLicenseFullName(v)}
                  isDisabled={isSaving}
                  size="small"
                />
                <TextInput
                  label={t('license_row.url_label')}
                  placeholder={t('license_row.url_placeholder')}
                  value={newLicenseUrl}
                  onChange={v => setNewLicenseUrl(v)}
                  isDisabled={isSaving}
                  size="small"
                />
                <div className={styles.EditActions}>
                  <Button size="small" onClick={handleCreateLicense} isDisabled={isSaving || !newLicenseName.trim()}>
                    {isSaving ? t('editor.saving') : t('license_row.create')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className={styles.Text}>{htmlDisplay(displayValue)}</div>
      )}
    </div>
  );
}
