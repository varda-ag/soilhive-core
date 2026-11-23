import type { ReactNode } from 'react';

import { Button } from '../Button/Button';

import styles from './LoginPageTemplate.module.scss';

interface Props {
  title: string;
  // Goes under the title. Its h3 and p are styled by the template.
  children?: ReactNode;
  loginButtonText: string;
  signupButtonText: string;
  image: string;
  login: () => void;
  signup: () => void;
}

export function LoginPageTemplate({ title, children, loginButtonText, signupButtonText, image, login, signup }: Props) {
  return (
    <div className={styles.LoginPageTemplate} data-testid="sh-ui-loginpagetemplate">
      <main className={styles.Content}>
        <h2 className={styles.Title}>{title}</h2>
        {children}
        <div className={styles.Actions}>
          <Button onClick={() => login()} dataTestId="sh-ui-loginpagetemplate-login">
            {loginButtonText}
          </Button>
          <Button type="secondary" onClick={() => signup()} dataTestId="sh-ui-loginpagetemplate-signup">
            {signupButtonText}
          </Button>
        </div>
      </main>
      <img src={image} className={styles.Image} />
    </div>
  );
}
