import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { type SaveCallbacks } from 'hooks/useMetadata';
import { useCreateLicenseMutation } from 'hooks/useDatasetMutation';
import useNotifications from 'hooks/useNotifications';
import styles from './LicenseRow.module.scss';
import { Button, Dropdown, TextInput } from 'components/UI';
import { htmlDisplay } from 'utilities/isomorphicHTMLDisplay';
import EditIcon from 'assets/icons/pencil-icon.svg?react';
import type { License } from 'types/backend';

const NEW_LICENSE_CODE = '__new_license__';

export function LicenseRow({
  label,
  currentLicenseIds,
  allLicenses,
  isEditable,
  property,
  isRequired,
  onStartEditing,
  onSave,
  onCancel,
}: {
  label: string;
  currentLicenseIds: string[];
  allLicenses: License[];
  isEditable: boolean;
  property: string;
  isRequired?: boolean;
  onStartEditing: (property: string) => void;
  onSave: (property: string, value: string, callbacks: SaveCallbacks) => void;
  onCancel: (property: string) => void;
}) {
  const { t } = useTranslation('metadata');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editValue, setEditValue] = useState(currentLicenseIds[0] ?? '');
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

  const isSaveDisabled = isRequired ? !editValue : false;

  const handleSave = () => {
    if (editValue === NEW_LICENSE_CODE) {
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
            onSave(property, newLicense.id, {
              onSuccess: () => {
                setIsEditing(false);
                setIsSaving(false);
              },
              onError: error => {
                setIsSaving(false);
                showNotification({
                  id: 'license-save-error',
                  title: t('license_row.failed_to_save'),
                  message: error.message,
                  type: 'error',
                });
              },
            });
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
    } else {
      setIsSaving(true);
      onSave(property, editValue, {
        onSuccess: () => {
          setIsEditing(false);
          setIsSaving(false);
        },
        onError: error => {
          setIsSaving(false);
          showNotification({
            id: 'license-save-error',
            title: t('license_row.failed_to_save'),
            message: error.message,
            type: 'error',
          });
        },
      });
    }
  };

  return (
    <div className={`${styles.Row}${isEditable && !isEditing ? ` ${styles.RowAdmin}` : ''}`}>
      <p className={styles.Label}>
        <strong>
          {label}
          {isRequired && <sup>*</sup>}
        </strong>
      </p>
      {isEditing ? (
        <div className={styles.EditArea}>
          <div className={styles.EditorWrapper}>
            <Dropdown
              options={licenseOptions}
              value={editValue}
              onChange={selected => setEditValue(selected as string)}
              isDisabled={isSaving}
              placeholder={t('license_row.select_placeholder')}
              size="small"
            />
            {editValue === NEW_LICENSE_CODE && (
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
              </div>
            )}
          </div>
          <div className={styles.EditActions}>
            <Button
              size="small"
              onClick={handleSave}
              isDisabled={isSaving || isSaveDisabled || (editValue === NEW_LICENSE_CODE && !newLicenseName.trim())}
            >
              {isSaving ? t('editor.saving') : t('editor.save')}
            </Button>
            <Button
              type="secondary"
              size="small"
              onClick={() => {
                setEditValue(currentLicenseIds[0] ?? '');
                setNewLicenseName('');
                setNewLicenseFullName('');
                setNewLicenseUrl('');
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
          <div className={styles.Text}>{htmlDisplay(displayValue)}</div>
          {isEditable && (
            <button
              type="button"
              className={styles.EditButton}
              onClick={() => {
                setEditValue(currentLicenseIds[0] ?? '');
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
