import { useTranslation } from 'react-i18next';
import classnames from 'classnames';

import { ColorsSettings } from 'components/AdminPortal/LookAndFeel/ColorsSettings/ColorsSettings';
import { ColorsPreview } from 'components/AdminPortal/LookAndFeel/ColorsPreview/ColorsPreview';

import styles from './ColorsTab.module.scss';

export function ColorsTab() {
  const { t } = useTranslation('admin');

  return (
    <div className={styles.ColorsTab}>
      <main className={classnames(styles.Section, styles.Main)}>
        <h2 className={styles.Title}>{t('look_and_feel.colors.title')}</h2>
        <ColorsSettings />
      </main>
      <aside className={classnames(styles.Section, styles.Aside)}>
        <h2 className={styles.Title}>{t('look_and_feel.colors.preview.title')}</h2>
        <ColorsPreview />
      </aside>
    </div>
  );
}
