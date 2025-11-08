import { Map as MLibreMap } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";

(window as any).React2 = require("react");
const r1 = (window as any).React1;
const r2 = (window as any).React2;
console.log(`[module] React1 ${r1} === React2 ${r2} is`, r1 === r2);

function Map() {
  //const [count, setCount] = store.useCount();
  return (
    <div style={{ width: "100%", height: "100%" }}>
      {
        <MLibreMap
          initialViewState={{
            longitude: -100,
            latitude: 40,
            zoom: 3.5,
          }}
          style={{ width: 600, height: 400 }}
          mapStyle="https://demotiles.maplibre.org/style.json"
        ></MLibreMap>
      }
      <p>Context count = {123}</p>
      <button>Increment</button>
    </div>
  );
}

export default Map;
