import React from 'react';
import { useTestValue, useAuthContext } from 'frontend-hooks';
import './ProviderComponent.css';

const Page: React.FC = () => {
  const { value } = useTestValue();
  const { isAuthenticated, isLoading, user } = useAuthContext();

  return (
    <div className="container">
      <div className="icon-container">
        <img src="https://module-federation.io/svg.svg" alt="logo" className="logo-image" />
      </div>
      <h1 className="title">Hello Module Federation 2.0</h1>
      <p>Value from host: {value ?? '(none received)'}</p>
      <p>
        Auth:{' '}
        {isLoading
          ? 'loading…'
          : isAuthenticated
            ? `authenticated as ${user?.profile?.name ?? user?.profile?.email ?? 'unknown user'}`
            : 'not authenticated'}
      </p>
    </div>
  );
};

const name = '★ Name of remote module ★';
const type = 'single-page';
const route = 'remote-module';
export { name, route, type, Page };
