import { Navigate, Route, Routes } from 'react-router';
import PageTitle from 'components/PageTitle';
import { AvailabilityProvider } from '../contexts/AvailabilityContext';
import DownloadSummary from '../pages/DownloadSummary';
import DownloadPreview from '../pages/DownloadPreview';
import Availability from '../pages/Availability';

function AvailabilityModule() {
  return (
    <Routes>
      <Route
        index
        element={
          <>
            <PageTitle title="SoilHive - Home" />
            <AvailabilityProvider>
              <Availability />
            </AvailabilityProvider>
          </>
        }
      />
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
    </Routes>
  );
}

export default AvailabilityModule;
