import { Button } from 'components/UI';
import { useAuthContext } from '../../auth/AuthContextProvider';
import UserIcon from '../../assets/icons/small-user-icon.svg?react';
import { useTranslation } from 'react-i18next';

export default function AuthButton() {
  const { isAuthenticated, isLoading, login, logout, authMode } = useAuthContext();
  const { t } = useTranslation('common');

  if (authMode === 'none') return null;

  if (isLoading) return <span>{t('loading')}</span>;

  if (isAuthenticated)
    return (
      <Button type={'tertiary'} onClick={logout}>
        <UserIcon />
        {t('auth.logout')}
      </Button>
    );

  return (
    <Button type={'tertiary'} onClick={() => login()}>
      <UserIcon />
      {t('auth.login')}
    </Button>
  );
}
