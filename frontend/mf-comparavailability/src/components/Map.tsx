import { Map as MLibreMap } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { store } from "../../moduleFederation";

import React from "react";

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  // Convert to positive 32-bit integer
  return hash >>> 0;
}

console.log("[MAP] React version:", React.version, hashString(JSON.stringify(React)));
window.stringMap = JSON.stringify(React);

function Map() {
  const [count, setCount] = store.useCount();
  return (
    <div style={{ width: "100%", height: "100%" }}>
      {count > 3 && (
        <MLibreMap
          initialViewState={{
            longitude: -100,
            latitude: 40,
            zoom: 3.5,
          }}
          style={{ width: 600, height: 400 }}
          mapStyle="https://demotiles.maplibre.org/style.json"
        ></MLibreMap>
      )}
      <p>Context count = {count}</p>
      <button onClick={() => setCount((cnt: number) => cnt + 1)}>Increment</button>
    </div>
  );
}

export default Map;
