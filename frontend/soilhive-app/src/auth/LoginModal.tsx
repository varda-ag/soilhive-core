import { useState, type FormEvent } from 'react';
import './LoginModal.css';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (password: string) => Promise<void>;
  error?: Error;
}

export function LoginModal({ isOpen, onClose, onLogin, error }: LoginModalProps) {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
        <h2>Login</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            disabled={isLoading}
            autoFocus
          />
          {error && <div className="error">{error.message}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose} disabled={isLoading}>
              Cancel
            </button>
            <button type="submit" disabled={isLoading || !password}>
              {isLoading ? 'Logging in ...' : 'Login'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
