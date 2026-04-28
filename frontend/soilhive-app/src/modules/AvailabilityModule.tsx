import { Navigate, Outlet, Route, Routes } from 'react-router';
import PageTitle from 'components/PageTitle';
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
  return (
    <AvailabilityProvider>
      <Outlet />
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
        </Route>
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
    </Routes>
  );
}
