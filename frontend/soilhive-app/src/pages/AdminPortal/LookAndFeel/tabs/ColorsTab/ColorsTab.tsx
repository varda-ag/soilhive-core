import { useTranslation } from 'react-i18next';
import classnames from 'classnames';

import ResetIcon from 'assets/icons/small-reset-icon.svg?react';
import BookmarkIcon from 'assets/icons/small-bookmark-icon.svg?react';
import { Button } from 'components/UI';
import { ColorsSettings } from 'components/AdminPortal/LookAndFeel/ColorsSettings/ColorsSettings';
import { ColorsPreview } from 'components/AdminPortal/LookAndFeel/ColorsPreview/ColorsPreview';
import useLookAndFeel from 'hooks/useLookAndFeel';

import styles from './ColorsTab.module.scss';

export function ColorsTab() {
  const { t } = useTranslation('admin');
  const { handleDefaultColorsSave, restoreDefaultColors, defaultColors } = useLookAndFeel();

  return (
    <div className={styles.ColorsTab}>
      <main className={classnames(styles.Section, styles.Main)}>
        <h2 className={styles.Title}>{t('look_and_feel.colors.title')}</h2>
        <p className={styles.Message}>{t('look_and_feel.colors.message')}</p>
        <div className={styles.DefaultColorButtons}>
          <Button data-testid="save-default-button" className={styles.Button} type="custom" size="tiny" onClick={handleDefaultColorsSave}>
            <BookmarkIcon /> {t('look_and_feel.colors.save_default_button')}
          </Button>
          <Button
            data-testid="restore-default-button"
            className={styles.Button}
            type="custom"
            size="tiny"
            isDisabled={!defaultColors}
            onClick={restoreDefaultColors}
          >
            <ResetIcon /> {t('look_and_feel.colors.restore_default_button')}
          </Button>
        </div>
        <ColorsSettings />
      </main>
      <aside className={classnames(styles.Section, styles.Aside)}>
        <h2 className={styles.Title}>{t('look_and_feel.colors.preview.title')}</h2>
        <ColorsPreview />
      </aside>
    </div>
  );
}
