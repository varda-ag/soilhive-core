import { useTranslation } from 'react-i18next';
import classnames from 'classnames';

import { Button, FormMessage } from 'components/UI';

import styles from './LogoPreview.module.scss';

interface Props {
  previewLogo: string;
  isActualLogo: boolean;
  errorMessage?: string | null;
  onChange: () => void;
  onDelete: () => void;
}

export function LogoPreview({ previewLogo, isActualLogo, errorMessage, onChange, onDelete }: Props) {
  const { t } = useTranslation('admin');

  return (
    <>
      <div className={classnames(styles.LogoPreview, { [styles.Error]: !!errorMessage })}>
        <p className={styles.Title}>{t(isActualLogo ? 'look_and_feel.logo.actual_logo' : 'look_and_feel.logo.logo_preview')}</p>

        <div className={styles.Content}>
          <div className={styles.ImageWrapper}>
            <img src={previewLogo} alt={t('look_and_feel.logo.logo_preview')} className={styles.Image} />
          </div>
          <Button type="secondary" onClick={onChange}>
            {t('look_and_feel.logo.change_button')}
          </Button>
          <Button type="tertiary" onClick={onDelete}>
            {t('look_and_feel.logo.delete_button')}
          </Button>
        </div>
      </div>
      {!!errorMessage && <FormMessage message={errorMessage} type="error" />}
    </>
  );
}
