import classnames from 'classnames';
import styles from './ProgressBar.module.scss';

interface Props {
  progress: number[];
  // Animated with no width, for work whose progress isn't known
  indeterminate?: boolean;
}

export function ProgressBar({ progress, indeterminate }: Props) {
  if (!progress || progress.length === 0) return null;

  const completed = progress.reduce((acc, part) => acc + part, 0) / progress.length;

  return (
    <div data-testid="sh-ui-progressbar" className={styles.ProgressBar}>
      <div
        data-testid="sh-ui-progressbar-fill"
        className={classnames(styles.Fill, indeterminate && styles.Indeterminate)}
        style={indeterminate ? undefined : { width: `${completed}%` }}
      ></div>
    </div>
  );
}
