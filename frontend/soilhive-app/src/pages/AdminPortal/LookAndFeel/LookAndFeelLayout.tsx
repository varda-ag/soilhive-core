import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { AdminPageTabs } from 'components/AdminPortal/AdminPageTabs/AdminPageTabs';
import { Button } from 'components/UI';
import { ADMIN_PATHS } from '../../../configuration/admin';
import UploadIcon from 'assets/icons/small-upload-icon.svg?react';

import styles from './LookAndFeelLayout.module.scss';

export function LookAndFeelLayout() {
  const { t } = useTranslation('admin');
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const tabsConfig = useMemo(
    () => [
      { value: ADMIN_PATHS.LOOK_AND_FEEL_LOGO, label: t('look_and_feel.tabs.logo') },
      { value: ADMIN_PATHS.LOOK_AND_FEEL_COLORS, label: t('look_and_feel.tabs.colors') },
    ],
    [t],
  );

  return (
    <>
      <div className={styles.Layout}>
        <AdminPageTabs tabsData={tabsConfig} activeTab={pathname} onChange={navigate}>
          <div className={styles.Actions}>
            <Button data-testid="sh-lookandfeel-cancel" type="secondary" size="tiny">
              {t('look_and_feel.cancel')}
            </Button>
            <Button data-testid="sh-lookandfeel-publish" type="primary" size="tiny">
              <UploadIcon /> {t('look_and_feel.publish')}
            </Button>
          </div>
        </AdminPageTabs>
        <main className={styles.Content}>
          <Outlet />
        </main>
      </div>
    </>
  );
}
