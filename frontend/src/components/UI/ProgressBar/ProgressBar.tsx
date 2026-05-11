import styles from './ProgressBar.module.scss';

interface Props {
  progress: number[];
}

export function ProgressBar({ progress }: Props) {
  if (!progress || progress.length === 0) return null;

  const completed = progress.reduce((acc, part) => acc + part, 0) / progress.length;

  return (
    <div data-testid="sh-ui-progressbar" className={styles.ProgressBar}>
      <div data-testid="sh-ui-progressbar-fill" className={styles.Fill} style={{ width: `${completed}%` }}></div>
    </div>
  );
}
