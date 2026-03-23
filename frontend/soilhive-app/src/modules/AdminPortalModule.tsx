import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes } from 'react-router';
import PageTitle from 'components/PageTitle';
import { TermsAndConditions, DatasetsPublication, LookAndFeel, MapBasedFilters, MapSettings } from '../pages/AdminPortal';
import { ADMIN_ROOT, ADMIN_ROUTES } from '../configuration/admin';
import { ADMIN_PORTAL_DATA_MENU, ADMIN_PORTAL_UI_MENU, useEntitlements } from 'hooks/useEntitlementsHook';

export function AdminPortalModule() {
  const { t } = useTranslation('admin');
  const { can } = useEntitlements();

  return (
    <Routes>
      <Route
        index
        element={<Navigate to={can(ADMIN_PORTAL_UI_MENU) ? ADMIN_ROUTES.TERMS_AND_CONDITIONS : ADMIN_ROUTES.DATASETS} replace />}
      />
      {can(ADMIN_PORTAL_UI_MENU) && (
        <>
          <Route
            path={ADMIN_ROUTES.TERMS_AND_CONDITIONS}
            element={
              <>
                <PageTitle title={t('page_titles.terms_and_conditions')} />
                <TermsAndConditions />
              </>
            }
          />
          <Route
            path={ADMIN_ROUTES.MAP}
            element={
              <>
                <PageTitle title={t('page_titles.map_settings')} />
                <MapSettings />
              </>
            }
          />
          <Route
            path={ADMIN_ROUTES.LOOK_AND_FEEL}
            element={
              <>
                <PageTitle title={t('page_titles.look_and_feel')} />
                <LookAndFeel />
              </>
            }
          />
        </>
      )}

      {can(ADMIN_PORTAL_DATA_MENU) && (
        <>
          <Route
            path={ADMIN_ROUTES.DATASETS}
            element={
              <>
                <PageTitle title={t('page_titles.datasets')} />
                <DatasetsPublication />
              </>
            }
          />
          <Route
            path={ADMIN_ROUTES.FILTERS}
            element={
              <>
                <PageTitle title={t('page_titles.filters')} />
                <MapBasedFilters />
              </>
            }
          />
        </>
      )}
      <Route path="*" element={<Navigate to={ADMIN_ROOT} replace />} />
    </Routes>
  );
}
