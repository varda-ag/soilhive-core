import classNames from 'classnames';
import styles from './Steps.module.scss';
import CheckIcon from '../assets/icons/big-check-mark-icon.svg?react';

interface Props {
  steps: Array<{ title: string; description: string }>;
  currentIndex: number;
  orientation?: 'vertical' | 'horizontal';
  showCompletedIcon?: boolean;
  className?: string;
}

export function Steps({ steps = [], currentIndex = 0, orientation = 'vertical', showCompletedIcon = true, className }: Props) {
  return (
    <div className={classNames(styles.Steps, className)}>
      {steps.map(({ title, description }, index) => {
        return (
          <div
            className={classNames(
              styles.Step,
              { [styles.Horizontal]: orientation === 'horizontal' },
              { [styles.Visited]: index <= currentIndex },
            )}
            key={index}
          >
            <div className={styles.Index}>{showCompletedIcon && index < currentIndex ? <CheckIcon /> : <>{index + 1}</>}</div>
            <div className={styles.TextWrapper}>
              <div className={styles.Title}>{title}</div>
              <div className={styles.Description}>{description}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
