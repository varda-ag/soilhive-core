import { useMemo } from 'react';
import classnames from 'classnames';

import WarningIcon from 'assets/icons/warning-icon.svg?react';
import QuestionIcon from 'assets/icons/question-round-icon.svg?react';
import InfoIcon from 'assets/icons/small-info-icon.svg?react';

import styles from './FormMessage.module.scss';

type FormMessageType = 'error' | 'warning' | 'info';

interface Props {
  message: string;
  type?: FormMessageType;
  withBackground?: boolean;
}

export function FormMessage({ message, withBackground, type = 'info' }: Props) {
  const typeClass = useMemo(
    () =>
      ({
        error: styles.ErrorMessage,
        warning: styles.WarningMessage,
        info: styles.InfoMessage,
      })[type],
    [type],
  );

  const Icon = useMemo(
    () =>
      ({
        error: WarningIcon,
        warning: QuestionIcon,
        info: InfoIcon,
      })[type],
    [type],
  );

  return (
    <div
      data-testid="sh-form-message"
      className={classnames(styles.FormMessage, typeClass, {
        [styles.Global]: withBackground,
      })}
    >
      <Icon data-testid={`sh-form-message-icon-${type}`} className={styles.FormMessageIcon} />
      <span className={styles.FormMessageText}>{message}</span>
    </div>
  );
}
