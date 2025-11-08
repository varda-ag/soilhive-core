(window as any).React1 = require("react");
const r1 = (window as any).React1;
const r2 = (window as any).React2;
console.log(`[app] React1 ${r1} === React2 ${r2} is`, r1 === r2);

function Homepage() {
  return (
    <div className="home-page">
      <h1>Homepage</h1>
      <p>This is the homepage</p>
    </div>
  );
};

export default Homepage;
