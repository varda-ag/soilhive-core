import { useState, type FormEvent } from 'react';
import './LoginModal.css';
import { useTranslation } from 'react-i18next';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (password: string) => Promise<void>;
  error?: Error;
}

export function LoginModal({ isOpen, onClose, onLogin, error }: LoginModalProps) {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { t } = useTranslation('common');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await onLogin(password);
      setPassword('');
      onClose();
    } catch {
      // error handled by the hook
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>{t('auth.login_title')}</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder={t('auth.password_placeholder')}
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={isLoading}
            autoFocus
          />
          {error && <div className="error">{error.message}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={isLoading}>
              {t('auth.cancel')}
            </button>
            <button type="submit" disabled={isLoading || !password}>
              {isLoading ? t('auth.logging_in') : t('auth.login')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
