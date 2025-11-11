import SoilhiveMap from "../components/SoilhiveMap";

function Homepage() {
  return (
    <div className="home-page">
      <h1>Homepage</h1>
      <p>This is the homepage</p>
      <SoilhiveMap initialViewBoundingBox={[6.6272658, 35.2889616, 18.7844746, 47.0921462]} />
    </div>
  );
};

export default Homepage;
