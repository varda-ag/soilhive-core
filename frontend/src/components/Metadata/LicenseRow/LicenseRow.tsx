import { useState } from 'react';
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
  onStartEditing,
  onSave,
  onCancel,
}: {
  label: string;
  currentLicenseIds: string[];
  allLicenses: License[];
  isEditable: boolean;
  property: string;
  onStartEditing: (property: string) => void;
  onSave: (property: string, value: string, callbacks: SaveCallbacks) => void;
  onCancel: (property: string) => void;
}) {
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
    { code: NEW_LICENSE_CODE, name: 'Custom license' },
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
                  title: 'Failed to save license',
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
              title: 'Failed to create license',
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
            title: 'Failed to save license',
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
        <strong>{label}</strong>
      </p>
      {isEditing ? (
        <div className={`${styles.EditArea}${isSaving ? ` ${styles.EditAreaSaving}` : ''}`}>
          <div className={styles.EditorWrapper}>
            <Dropdown
              options={licenseOptions}
              value={editValue}
              onChange={selected => setEditValue(selected as string)}
              isDisabled={isSaving}
              placeholder="Select a license"
              size="small"
            />
            {editValue === NEW_LICENSE_CODE && (
              <div className={styles.NewLicenseFields}>
                <TextInput
                  label="Name"
                  placeholder="e.g. CC-BY-4.0"
                  value={newLicenseName}
                  onChange={v => setNewLicenseName(v)}
                  isDisabled={isSaving}
                  isRequired
                  size="small"
                />
                <TextInput
                  label="Full name"
                  placeholder="e.g. Creative Commons Attribution 4.0"
                  value={newLicenseFullName}
                  onChange={v => setNewLicenseFullName(v)}
                  isDisabled={isSaving}
                  size="small"
                />
                <TextInput
                  label="URL"
                  placeholder="e.g. https://creativecommons.org/licenses/by/4.0/"
                  value={newLicenseUrl}
                  onChange={v => setNewLicenseUrl(v)}
                  isDisabled={isSaving}
                  size="small"
                />
              </div>
            )}
          </div>
          <div className={styles.EditActions}>
            <Button size="small" onClick={handleSave} isDisabled={isSaving || (editValue === NEW_LICENSE_CODE && !newLicenseName.trim())}>
              {isSaving ? 'Saving…' : 'Save'}
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
              Cancel
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
