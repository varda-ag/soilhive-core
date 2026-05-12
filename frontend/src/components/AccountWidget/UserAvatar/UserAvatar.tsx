import { useMemo } from 'react';
import classnames from 'classnames';
import { useAuthContext } from '../../../auth/AuthContextProvider';

import styles from './UserAvatar.module.scss';

interface Props {
  className?: string;
}

export function UserAvatar({ className }: Props) {
  const { user } = useAuthContext();

  const displayName = useMemo(() => {
    if (user?.profile?.given_name && user?.profile?.family_name) {
      return `${user.profile.given_name.charAt(0)}${user.profile.family_name.charAt(0)}`;
    }

    if (user?.profile?.name) {
      return user.profile.name.charAt(0);
    }

    return user?.profile?.email?.charAt(0);
  }, [user]);

  return (
    <div data-testid="sh-ui-useravatar" className={classnames(styles.UserAvatar, className)}>
      <span className={styles.UserAvatarPlaceholder}>{displayName}</span>
    </div>
  );
}
