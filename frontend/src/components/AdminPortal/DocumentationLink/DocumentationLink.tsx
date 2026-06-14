import { useTranslation } from 'react-i18next';
import BookOpenIcon from 'assets/icons/book-open-icon.svg?react';

import styles from './DocumentationLink.module.scss';

interface Props {
  href: string;
}

export function DocumentationLink({ href }: Props) {
  const { t } = useTranslation('admin');

  return (
    <a data-testid="sh-documentaion-link" href={href} className={styles.DocumentationLink} target="_blank" rel="noreferrer">
      <BookOpenIcon /> {t('datasets.actions.open_documentation')}
    </a>
  );
}
