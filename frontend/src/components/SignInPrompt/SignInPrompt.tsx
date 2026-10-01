import { useTranslation } from 'react-i18next';
import { LoginButton } from 'components/AccountWidget/LoginButton/LoginButton';

import styles from './SignInPrompt.module.scss';

interface Props {
  title: string;
}

// Shown in place of a page that needs a signed-in user. Signing in re-renders
// the caller with the real page, on the same URL.
export function SignInPrompt({ title }: Props) {
  const { t } = useTranslation('common');

  return (
    <div data-testid="sh-sign-in-prompt" className={styles.SignInPrompt}>
      <h1 className={styles.Title}>{title}</h1>
      <p className={styles.Message}>{t('auth.sign_in_prompt.message')}</p>
      <LoginButton />
    </div>
  );
}
