import useTheme from '../../hooks/useTheme';
import { Button } from 'components/UI';
import { config } from './config';
import { ThemeColorField } from './ThemeColorField';
import { useTranslation } from 'react-i18next';

import styles from './ThemeConfig.module.scss';

export function ThemeConfig() {
  const { theme, handleColorChange, saveThemeConfig } = useTheme();
  const { t } = useTranslation('common');

  return (
    <div className={styles.Wrapper}>
      <h1>{t('theme_config.title')}</h1>

      <div className={styles.Section}>
        {config.map(({ label, name }) => {
          return <ThemeColorField key={name} label={label} initialValue={theme?.[name]} name={name} onChange={handleColorChange} />;
        })}
      </div>

      <div>
        <Button onClick={saveThemeConfig}>{t('theme_config.save')}</Button>
      </div>
    </div>
  );
}

export default ThemeConfig;
