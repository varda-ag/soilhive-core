import { BrowserRouter, Route, Routes } from "react-router";
import './styles/App.css';
import PageTitle from "./components/PageTitle";
import MainLayout from "./layouts/MainLayout";
import Homepage from "./pages/Homepage";
import Admin from "./pages/Admin";
import ThemeConfig from "./pages/ThemeConfig";
import { singlePages } from "./utilities/moduleFederation";
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthContextProvider } from "./auth/AuthContextProvider";

function App() {
  return (
    <AuthContextProvider>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<MainLayout />}>
              <Route index element={
                <>
                  <PageTitle title="Soilhive - Home" />
                  <Homepage />
                </>
              } />
              <Route path="/donation" element={
                <>
                  <PageTitle title="Soilhive - Donation" />
                </>
              } />
              <Route path="/admin" element={
                <>
                  <PageTitle title="Soilhive - Admin" />
                  <Admin />
                </>
              } />
              {singlePages.map(({ name, route, Page }) =>
                <Route path={`/${route}`} element={
                  <>
                    <PageTitle title={`Soilhive - ${name}`} />
                    <Page />
                  </>
                } />
              )}
            </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </AuthContextProvider>
  );
};

export default App;
