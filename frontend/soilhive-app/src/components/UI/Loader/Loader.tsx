import styles from './Loader.module.scss';

export function Loader() {
  return (
    <div className={styles.LoaderOverlay}>
      <div className={styles.Loader}></div>
    </div>
  );
}
