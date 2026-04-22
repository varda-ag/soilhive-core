import type { ReactNode } from 'react';
import Skeleton from 'react-loading-skeleton';

import styles from './MetaItem.module.scss';

type Props = {
  icon: ReactNode;
  children: ReactNode;
  isLoading?: boolean;
};

export function MetaItem({ icon, children, isLoading }: Props) {
  return (
    <p className={styles.MetaItem}>
      {icon}
      {isLoading ? <Skeleton count={1} height={12} width={50} /> : children}
    </p>
  );
}
