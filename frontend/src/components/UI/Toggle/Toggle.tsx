import classnames from 'classnames';
import styles from './Toggle.module.scss';

interface Props {
  labelOne: string;
  labelTwo: string;
  isToggled: boolean;
  onToggle: () => void;
  className?: string;
}

export function Toggle({ labelOne, labelTwo, isToggled, onToggle, className }: Props) {
  return (
    <div className={classnames(styles.LinkToggle, className)}>
      <span onClick={onToggle}>{isToggled ? labelTwo : labelOne}</span>
    </div>
  );
}
