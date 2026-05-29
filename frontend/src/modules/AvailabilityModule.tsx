import { useState } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router';
import { useTranslation } from 'react-i18next';
import PageTitle from 'components/PageTitle';
import { InfoDialog } from 'components/UI';
import useDevice from 'hooks/useDevice';
import { AvailabilityProvider } from '../contexts/AvailabilityContext';
import { AvailabilityMapProvider } from '../contexts/AvailabilityMapContext';
import DownloadSummary from '../pages/DownloadSummary';
import DownloadPreview from '../pages/DownloadPreview';
import Availability from '../pages/Availability';

const AvailabilityMapLayout = () => {
  return (
    <AvailabilityMapProvider>
      <Outlet />
    </AvailabilityMapProvider>
  );
};

const AvailabilityDataLayout = () => {
  const { isMobileLayout } = useDevice();
  const { t } = useTranslation(['common']);
  const [showMobileDialog, setShowMobileDialog] = useState(true);

  return (
    <AvailabilityProvider>
      <Outlet />
      <InfoDialog
        isVisible={isMobileLayout && showMobileDialog}
        storageKey="no-download-on-mobile"
        header={t('mobile_download_dialog.header')}
        title={t('mobile_download_dialog.title')}
        message={t('mobile_download_dialog.message')}
        onContinue={() => setShowMobileDialog(false)}
        onCancel={() => setShowMobileDialog(false)}
      />
    </AvailabilityProvider>
  );
};

export default function AvailabilityModule() {
  return (
    <Routes>
      <Route element={<AvailabilityMapLayout />}>
        <Route element={<AvailabilityDataLayout />}>
          <Route
            index
            element={
              <>
                <PageTitle title="SoilHive - Home" />
                <Availability />
              </>
            }
          />
          {/* TODO: adapt the download preview page to use the router and query parameters */}
          <Route
            path="/explore"
            element={
              <>
                <PageTitle title="SoilHive - Data Explorer" />
                <DownloadPreview />
              </>
            }
          />
          <Route
            path="/download"
            element={
              <>
                <PageTitle title="SoilHive - Download Summary" />
                <DownloadSummary />
              </>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
