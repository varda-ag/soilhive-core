import type { ReactNode } from 'react';

import styles from './FilterSection.module.scss';

interface Props {
  title: string;
  message: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function FilterSection({ title, message, actions, children }: Props) {
  return (
    <section className={styles.FilterSection}>
      <h3 className={styles.Title}>{title}</h3>
      <p className={styles.Message}>{message}</p>
      {children}
      {actions && <div className={styles.Actions}>{actions}</div>}
    </section>
  );
}
