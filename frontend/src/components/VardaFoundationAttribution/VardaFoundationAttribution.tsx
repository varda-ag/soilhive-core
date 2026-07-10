import classnames from 'classnames';
import { useTranslation } from 'react-i18next';
import styles from './VardaFoundationAttribution.module.scss';
import { htmlDisplay } from 'utilities/isomorphicHTMLDisplay';

interface Props {
  className?: string;
}

export function VardaFoundationAttribution({ className }: Props) {
  const { t } = useTranslation('common');

  return (
    <div className={classnames(styles.VardaFoundationAttribution, className)}>
      {htmlDisplay(t('components.varda_foundation_attribution.text'))}
    </div>
  );
}
