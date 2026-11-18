import { type FC, type SVGProps } from 'react';
import { NavLink } from 'react-router';
import classnames from 'classnames';

import type { NavMenuEntry } from 'types/components';

import styles from './MenuLink.module.scss';

interface Props {
  to?: string;
  text: string;
  type?: NavMenuEntry['type'];
  className?: string;
  textClassName?: string;
  activeClassName?: string;
  iconClassName?: string;
  Icon?: FC<SVGProps<SVGSVGElement>> | undefined;
  onClick?: () => void;
}

export default function MenuLink({
  to = '',
  text,
  type = 'internal',
  className,
  textClassName,
  activeClassName,
  iconClassName,
  Icon,
  onClick,
}: Props) {
  const getNavLinkClass = ({ isActive }: { isActive: boolean }) => {
    return isActive ? classnames(className, activeClassName) : className || '';
  };

  const content = (
    <>
      {Icon && <Icon className={iconClassName} />}
      <span className={textClassName}>{text}</span>
    </>
  );

  if (type === 'action') {
    return (
      <button type="button" data-testid="sh-header-nav-action" className={classnames(styles.Action, className)} onClick={onClick}>
        {content}
      </button>
    );
  }

  return type === 'internal' ? (
    <NavLink data-testid="sh-header-nav-link" to={to} className={getNavLinkClass} onClick={onClick}>
      {content}
    </NavLink>
  ) : (
    <a className={className} href={to} target="_blank" rel="noopener noreferrer" onClick={onClick}>
      {content}
    </a>
  );
}
