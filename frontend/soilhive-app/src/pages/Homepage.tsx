import React from "react";

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  // Convert to positive 32-bit integer
  return hash >>> 0;
}

console.log("[APP] React version:", React.version, hashString(JSON.stringify(React)));
window.stringApp = JSON.stringify(React);

function Homepage() {
  return (
    <div className="home-page">
      <h1>Homepage</h1>
      <p>This is the homepage</p>
    </div>
  );
};

export default Homepage;
