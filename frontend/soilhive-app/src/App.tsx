import { BrowserRouter, Route, Routes } from "react-router";
import './App.css';
import Homepage from "./pages/Homepage";
import Donation from "./pages/Donation";
import Admin from "./pages/Admin";
import MainLayout from "./layouts/MainLayout";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<Homepage />} />
          <Route path="/donation" element={<Donation />} />
          <Route path="/admin" element={<Admin />} />
        </Route>        
      </Routes>
    </BrowserRouter>
  );
};

export default App;
