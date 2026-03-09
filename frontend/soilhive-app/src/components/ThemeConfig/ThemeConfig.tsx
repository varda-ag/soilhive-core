import useTheme from '../../hooks/useTheme';
import { Button } from 'components/UI';
import { config } from './config';
import { ThemeColorField } from './ThemeColorField';
import { useTranslation } from 'react-i18next';

import styles from './ThemeConfig.module.scss';

export function ThemeConfig() {
  const { theme, logo, handleColorChange, handleLogoChange, saveThemeConfig, deleteLogo } = useTheme();
  const { t } = useTranslation('common');

  return (
    <div className={styles.Wrapper}>
      <h1>{t('theme_config.title')}</h1>

      <div className={styles.Section}>
        {config.map(({ label, name }) => {
          return <ThemeColorField key={name} label={label} initialValue={theme?.[name]} name={name} onChange={handleColorChange} />;
        })}
        <div className={styles.FlexRow}>
          <label htmlFor="logo">{t('theme_config.logo_label')} </label>
          <input id="logo" name="logo" type="file" onChange={handleLogoChange} multiple={false} />
          {!!logo && <img src={logo} style={{ width: '50px', height: '20px' }} />}
          <Button type="secondary" size="tiny" onClick={deleteLogo}>
            {t('theme_config.delete_logo')}
          </Button>
        </div>
      </div>

      <div>
        <Button onClick={saveThemeConfig}>{t('theme_config.save')}</Button>
      </div>
    </div>
  );
}

export default ThemeConfig;
