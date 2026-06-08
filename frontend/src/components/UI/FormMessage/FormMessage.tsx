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
  showBorder?: boolean;
  className?: string;
}

export function FormMessage({ message, withBackground, className, type = 'info', showBorder = true }: Props) {
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
      className={classnames(styles.FormMessage, typeClass, className, {
        [styles.Global]: withBackground,
        [styles.Border]: withBackground && showBorder,
      })}
    >
      <Icon data-testid={`sh-form-message-icon-${type}`} className={styles.FormMessageIcon} />
      <span className={styles.FormMessageText}>{message}</span>
    </div>
  );
}
