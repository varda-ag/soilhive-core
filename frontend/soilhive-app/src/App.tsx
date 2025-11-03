import { BrowserRouter, Route, Routes } from "react-router";
import './styles/App.css';
import PageTitle from "./components/PageTitle";
import MainLayout from "./layouts/MainLayout";
import Homepage from "./pages/Homepage";
import Donation from "./pages/Donation";
import Admin from "./pages/Admin";
import {singlePages} from "./utilities/moduleFederation";

// require('react-dom');
// (window as any).React2 = require('react');
// console.log("React1 === React2 = ", (window as any).React1 === (window as any).React2); // Should be true

function App() {
  return (
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
              <Donation />
            </>
          } />
          <Route path="/admin" element={
            <>
              <PageTitle title="Soilhive - Admin" />
              <Admin />
            </>
          } />
          {singlePages.map(({name, route, Page}) =>
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
  );
};

export default App;
