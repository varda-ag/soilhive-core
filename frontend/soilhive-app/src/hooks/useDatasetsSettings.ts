import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ADMIN_PATHS } from '../configuration/admin';
import { isValidEmail } from '../utilities/validation';

export type Visibility = 'public' | 'private';

export type AccessEmail = { email: string };

export function useDatasetsSettings(invalidEmailMessage: string) {
  const navigate = useNavigate();

  const [visibility, setVisibility] = useState<Visibility>('public');
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState('');
  const [accessEmails, setAccessEmails] = useState<AccessEmail[]>([]);
  const [emailToDelete, setEmailToDelete] = useState<string | null>(null);

  function handleEmailChange(value: string) {
    setEmailInput(value);
    setEmailError('');
  }

  function handleEmailBlur() {
    if (emailInput.trim() && !isValidEmail(emailInput)) {
      setEmailError(invalidEmailMessage);
    }
  }

  function handleAddEmail() {
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    if (!isValidEmail(trimmed)) {
      setEmailError(invalidEmailMessage);
      return;
    }
    if (accessEmails.some(e => e.email === trimmed)) return;
    setAccessEmails(prev => [...prev, { email: trimmed }]);
    setEmailInput('');
    setEmailError('');
  }

  function handleRequestRemoveEmail(email: string) {
    setEmailToDelete(email);
  }

  function handleConfirmRemoveEmail() {
    if (emailToDelete) {
      setAccessEmails(prev => prev.filter(e => e.email !== emailToDelete));
    }
    setEmailToDelete(null);
  }

  function handleCancelRemoveEmail() {
    setEmailToDelete(null);
  }

  function handleCancel() {
    navigate(ADMIN_PATHS.DATASETS);
  }

  return {
    visibility,
    setVisibility,
    emailInput,
    emailError,
    accessEmails,
    emailToDelete,
    handleEmailChange,
    handleEmailBlur,
    handleAddEmail,
    handleRequestRemoveEmail,
    handleConfirmRemoveEmail,
    handleCancelRemoveEmail,
    handleCancel,
  };
}
