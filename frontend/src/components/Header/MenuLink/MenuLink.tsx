import { type FC, type SVGProps } from 'react';
import { NavLink } from 'react-router';
import classnames from 'classnames';

interface Props {
  to: string;
  text: string;
  type?: 'internal' | 'external';
  className?: string;
  textClassName?: string;
  activeClassName?: string;
  iconClassName?: string;
  Icon?: FC<SVGProps<SVGSVGElement>> | undefined;
  onClick?: () => void;
}

export default function MenuLink({
  to,
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

  return (
    <>
      {type === 'internal' ? (
        <NavLink data-testid="sh-header-nav-link" to={to} className={getNavLinkClass} onClick={onClick}>
          {Icon && <Icon className={iconClassName} />}
          <span className={textClassName}>{text}</span>
        </NavLink>
      ) : (
        <a className={className} href={to} target="_blank" rel="noopener noreferrer" onClick={onClick}>
          {Icon && <Icon className={iconClassName} />}
          <span className={textClassName}>{text}</span>
        </a>
      )}
    </>
  );
}
