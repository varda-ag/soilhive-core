import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes } from 'react-router';
import PageTitle from 'components/PageTitle';
import {
  TermsAndConditions,
  DatasetsPublication,
  LookAndFeel,
  MapBasedFilters,
  MapSettings,
  NotificationBanner,
  PrivacyPolicy,
} from '../pages/AdminPortal';
import { ADMIN_ROOT, ADMIN_ROUTES } from '../configuration/admin';
import { ADMIN_PORTAL_DATA_MENU, ADMIN_PORTAL_UI_MENU, useEntitlements } from 'hooks/useEntitlementsHook';
import { DatasetsGeneralInfoStep } from '../pages/AdminPortal/DatasetsGeneralInfoStep/DatasetsGeneralInfoStep';
import { DatasetsPublicationStepsLayout } from '../layouts/DatasetsPublicationStepsLayout/DatasetsPublicationStepsLayout';
import { DatasetsSoilDataStep } from '../pages/AdminPortal/DatasetsSoilDataStep/DatasetsSoilDataStep';
import { DatasetsMappingsStep } from '../pages/AdminPortal/DatasetsMappingsStep/DatasetsMappingsStep';
import { DatasetsPreviewStep } from '../pages/AdminPortal/DatasetsPreviewStep/DatasetsPreviewStep';

function DatasetsRoutes() {
  const { t } = useTranslation('admin');

  return (
    <Routes>
      <Route
        index
        element={
          <>
            <PageTitle title={t('page_titles.datasets')} />
            <DatasetsPublication />
          </>
        }
      />
      <Route element={<DatasetsPublicationStepsLayout />}>
        <Route
          path={'new'}
          element={
            <>
              <PageTitle title={`${t('page_titles.datasets')} - ${t('datasets.general_info.title')}`} />
              <DatasetsGeneralInfoStep />
            </>
          }
        />
      </Route>
      <Route path="/edit/:id" element={<DatasetsPublicationStepsLayout />}>
        <Route index element={<Navigate to="general-info" replace />} />
        <Route
          path={'general-info'}
          element={
            <>
              <PageTitle title={`${t('page_titles.datasets')} - ${t('datasets.general_info.title')}`} />
              <DatasetsGeneralInfoStep />
            </>
          }
        />
        <Route
          path={'soil-data'}
          element={
            <>
              <PageTitle title={`${t('page_titles.datasets')} - ${t('datasets.soil_data.title')}`} />
              <DatasetsSoilDataStep />
            </>
          }
        />
        <Route
          path={'mappings'}
          element={
            <>
              <PageTitle title={`${t('page_titles.datasets')} - ${t('datasets.mappings.title')}`} />
              <DatasetsMappingsStep />
            </>
          }
        />
        <Route
          path={'preview'}
          element={
            <>
              <PageTitle title={`${t('page_titles.datasets')} - ${t('datasets.preview.title')}`} />
              <DatasetsPreviewStep />
            </>
          }
        />
        {/* TODO: quality check step will be implemented in a future version */}
        {/* <Route
          path={'quality-check'}
          element={
            <>
              <PageTitle title={`${t('page_titles.datasets')} - ${t('datasets.quality_check.title')}`} />
              <DatasetsQualityCheckStep />
            </>
          }
        /> */}
      </Route>
    </Routes>
  );
}

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
            path={ADMIN_ROUTES.PRIVACY_POLICY}
            element={
              <>
                <PageTitle title={t('page_titles.privacy_policy')} />
                <PrivacyPolicy />
              </>
            }
          />
          <Route
            path={ADMIN_ROUTES.NOTIFICATION_BANNER}
            element={
              <>
                <PageTitle title={t('page_titles.notification_banner')} />
                <NotificationBanner />
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
            path={`${ADMIN_ROUTES.LOOK_AND_FEEL}/*`}
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
          <Route path={`${ADMIN_ROUTES.DATASETS}/*`}>
            <Route path="*" element={<DatasetsRoutes />} />
          </Route>
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
