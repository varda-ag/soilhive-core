import React from "react";
import "./ProviderComponent.css";

const Page: React.FC = () => {
  return (
    <div className="container">
      <div className="icon-container">
        <img src="https://module-federation.io/svg.svg" alt="logo" className="logo-image" />
      </div>
      <h1 className="title">Hello Module Federation 2.0</h1>
    </div>
  );
};

const name = "Remote module";
const type = "single-page";
const route = "remote-module";
export { name, route, type, Page };
