// import { Map as MLibreMap } from 'react-map-gl/maplibre';
// import 'maplibre-gl/dist/maplibre-gl.css';

import { createContext, useContext} from "react";
import { createRegisteredContext } from "react-singleton-context";

// const StringContext = createContext('ciao');

// import { createRegisteredContext } from 'react-singleton-context';

// Create the React.Context with createRegisteredContext instead of React.createContext
const ExampleContext = createRegisteredContext(
    'MyLibraryNameExampleContext', // a sufficiently globally unique displayName
    'Ciao' // default value
);

// Export like normal; all consumers will be using a "singletonized" context
// export default ExampleContext;

function Map() {
  // const str = useContext(StringContext);
  const str = useContext(ExampleContext);
  return (
    <div style={{width:'100%', height: '100%'}}>
      {/* <MLibreMap
        initialViewState={{
          longitude: -100,
          latitude: 40,
          zoom: 3.5,
        }} 
        style={{width: 600, height: 400}}
        mapStyle="https://demotiles.maplibre.org/style.json"
      ></MLibreMap> */}
      Ciao come va?
      Context = {str}
    </div>
  );
};

export default Map;