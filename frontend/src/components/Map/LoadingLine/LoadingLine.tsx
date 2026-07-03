import styles from './LoadingLine.module.scss';

interface Props {
  isLoading?: boolean;
}

export default function LoadingLine({ isLoading }: Props) {
  return isLoading ? (
    <div className={styles.LoadingLine} data-testid="sh-loading-line">
      <div className={styles.Inner} data-testid="sh-loading-line-inner" />
    </div>
  ) : null;
}
