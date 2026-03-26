import classNames from 'classnames';
import styles from './Steps.module.scss';
import CheckIcon from 'assets/icons/big-check-mark-icon.svg?react';

export function Steps({ steps = [], currentIndex = 0 }: { steps: Array<{ title: string; description: string }>; currentIndex: number }) {
  return (
    <div className={styles.Steps}>
      {steps.map(({ title, description }, index) => {
        return (
          <div className={classNames(styles.Step, { [styles.Visited]: index <= currentIndex })} key={index}>
            <div className={styles.Index}>{index < currentIndex ? <CheckIcon /> : <>{index + 1}</>}</div>
            <div className={styles.Title}>{title}</div>
            <div className={styles.Description}>{description}</div>
          </div>
        );
      })}
    </div>
  );
}
