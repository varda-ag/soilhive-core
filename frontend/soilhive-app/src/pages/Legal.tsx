import DOMPurify from 'dompurify';
import parse from 'html-react-parser';
import styles from './Legal.module.scss';
import useTheme from '../hooks/useTheme';
import Skeleton from 'react-loading-skeleton';

function htmlDisplay(html: string) {
  const clean = DOMPurify.sanitize(html, { FORBID_TAGS: ['form', 'input', 'button', 'select', 'textarea'] });
  return <div className="content">{parse(clean)}</div>;
}

export default function Legal() {
  const { isLoadingThemeConfig, themeConfig } = useTheme();
  if (isLoadingThemeConfig) {
    return <Skeleton></Skeleton>;
  }
  return (
    <div className={styles.Layout}>
      <main className={styles.Content}>{htmlDisplay(themeConfig.termsAndConditionsHtml)}</main>
    </div>
  );
}
