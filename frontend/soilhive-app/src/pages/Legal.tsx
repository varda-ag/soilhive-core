import styles from './Legal.module.scss';
import useTheme from '../hooks/useTheme';
import Skeleton from 'react-loading-skeleton';
import { htmlDisplay } from '../utilities/html-display';

export default function Legal() {
  const { isLoadingThemeConfig, themeConfig } = useTheme();
  if (isLoadingThemeConfig) {
    return <Skeleton></Skeleton>;
  }
  return (
    <div className={styles.Layout}>
      <main className={styles.Content}>
        <div className="content">{htmlDisplay(themeConfig.termsAndConditionsHtml)}</div>
      </main>
    </div>
  );
}
