import DOMPurify from 'dompurify';
import parse from 'html-react-parser';
import styles from './Legal.module.scss';

function htmlDisplay(html: string) {
  const clean = DOMPurify.sanitize(html);
  return <div className="content">{parse(clean)}</div>;
}

export default function Legal({ html }: { html: string }) {
  return (
    <div className={styles.Layout}>
      <main className={styles.Content}>{htmlDisplay(html)}</main>
    </div>
  );
}
