import { useTranslation } from 'react-i18next';
import SmallUserIcon from '../../../assets/icons/small-user-icon.svg?react';
import { useAuthContext } from '../../../auth/AuthContextProvider';
import { Button } from 'components/UI';

export function LoginButton() {
  const { authMode, isLoading, login } = useAuthContext();
  const { t } = useTranslation('common');

  if (authMode === 'none' || isLoading) return null;

  return (
    <Button data-testid="sh-ui-loginbutton" type="tertiary" onClick={() => login()}>
      <SmallUserIcon />
      {t('auth.login')}
    </Button>
  );
}
