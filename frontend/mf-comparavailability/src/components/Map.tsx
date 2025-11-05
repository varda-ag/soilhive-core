// import { Map as MLibreMap } from 'react-map-gl/maplibre';
// import 'maplibre-gl/dist/maplibre-gl.css';

import { useCount } from "soilhiveapp/store";

function Map() {
  const [count, setCount] = useCount();
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
      <p>Context count = {count}</p>
      <button onClick={() => setCount((cnt:number) => cnt + 1)}>Increment</button>
    </div>
  );
};

export default Map;