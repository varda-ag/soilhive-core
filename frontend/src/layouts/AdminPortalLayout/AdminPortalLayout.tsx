import { Outlet } from 'react-router';
import { AdminHeader } from 'components/AdminPortal/AdminHeader/AdminHeader';
import { AdminSidebar } from 'components/AdminPortal/AdminSidebar/AdminSidebar';

import styles from './AdminPortalLayout.module.scss';

export function AdminPortalLayout() {
  return (
    <>
      <AdminHeader></AdminHeader>
      <div className={styles.Layout}>
        <AdminSidebar />
        <main className={styles.Content}>
          <Outlet />
        </main>
      </div>
    </>
  );
}
