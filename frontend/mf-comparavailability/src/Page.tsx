import Map from './components/Map';
import './Page.css';
import { CountProvider } from "soilhiveapp/store";

function Page() {
  return (
    <div className="page-comparavailability">
      <h1>Comparavailability</h1>
      <p>This is the comparavailability page</p>
      <CountProvider>
        <Map />
      </CountProvider>      
      hello!
    </div>
  );
};

export default Page;