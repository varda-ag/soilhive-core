import { Outlet, Route, Routes } from 'react-router';
import Homepage from '../pages/Homepage';
import PageTitle from 'components/PageTitle';
import { AvailabilityProvider } from '../contexts/AvailabilityContext';
import DownloadSummary from '../pages/DownloadSummary';

const AvailabilityContextLayout = () => {
  return (
    <AvailabilityProvider>
      <Outlet />
    </AvailabilityProvider>
  );
};

function AvailabilityModule() {
  return (
    <Routes>
      <Route element={<AvailabilityContextLayout />}>
        <Route
          index
          element={
            <>
              <PageTitle title="SoilHive - Home" />
              <Homepage />
            </>
          }
        />
        {/* TODO: adapt the download preview page to use the router and query parameters */}
        {/* <Route
          path="/preview"
          element={
            <>
              <PageTitle title="SoilHive - Download Preview" />
              <DownloadPreview />
            </>
          }
        /> */}
        <Route
          path="/download"
          element={
            <>
              <PageTitle title="SoilHive - Download Summary" />
              <DownloadSummary />
            </>
          }
        />
      </Route>
    </Routes>
  );
}

export default AvailabilityModule;
