import { BrowserRouter, Route, Routes } from "react-router";
import './App.css';
import MainLayout from "./layouts/MainLayout";
import Homepage from "./pages/Homepage";
import Donation from "./pages/Donation";
import Admin from "./pages/Admin";
import {singlePages} from "./utilities/moduleFederation";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<Homepage />} />
          <Route path="/donation" element={<Donation />} />
          <Route path="/admin" element={<Admin />} />
          {singlePages.map(({route, Page}) =>
            <Route path={`/${route}`} element={<Page />} />
          )}
        </Route>        
      </Routes>
    </BrowserRouter>
  );
};

export default App;
