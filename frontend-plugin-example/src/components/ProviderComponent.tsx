import React from 'react';
import type { PluginContext } from 'frontend-plugin-types';
import './ProviderComponent.css';

const Page: React.FC<{ context?: PluginContext }> = ({ context }) => {
  const user = context?.user;

  return (
    <div className="container">
      <div className="icon-container">
        <img src="https://module-federation.io/svg.svg" alt="logo" className="logo-image" />
      </div>
      <h1 className="title">Hello Module Federation 2.0</h1>
      <p>User from host: {user ? (user.profile?.name ?? user.profile?.email ?? 'authenticated user') : '(none received)'}</p>
    </div>
  );
};

const name = '★ Name of remote module ★';
const type = 'single-page';
const route = 'remote-module';
export { name, route, type, Page };
