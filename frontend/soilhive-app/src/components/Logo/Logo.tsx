import { useTranslation } from 'react-i18next';
import classnames from 'classnames';

import defaultLogo from 'assets/images/soil-hive-logo.svg';
import useTheme from 'hooks/useTheme';

import styles from './Logo.module.scss';

interface Props {
  className?: string;
}

export function Logo({ className }: Props) {
  const { t } = useTranslation('common');
  const { logo, isLogoLoading } = useTheme();

  return (
    <div data-testid="sh-logo" className={classnames(styles.Logo, className)}>
      {!isLogoLoading && <img className={styles.Img} src={logo || defaultLogo} alt={t('logo')} />}
    </div>
  );
}
