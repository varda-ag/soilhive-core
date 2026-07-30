import React from 'react';
import type { PluginContext } from 'frontend-plugin-types';
import './ProviderComponent.css';

const Page: React.FC<{ context: PluginContext }> = ({ context }) => {
  // Destructured (with a fallback), not `context.useDatasets()` — keeps
  // `useDatasets` a bare identifier, called unconditionally, so
  // eslint-plugin-react-hooks can actually check it.
  const { user, useDatasets = () => ({ data: undefined, isLoading: false, isError: false }) } = context;
  const { data: datasets, isLoading, isError } = useDatasets();

  return (
    <div className="container">
      <div className="icon-container">
        <img src="https://module-federation.io/svg.svg" alt="logo" className="logo-image" />
      </div>
      <h1 className="title">Hello Module Federation 2.0</h1>
      <p>User from host: {user ? (user.profile?.name ?? user.profile?.email ?? 'authenticated user') : '(none received)'}</p>
      <p>
        Datasets from host:{' '}
        {isLoading
          ? 'loading…'
          : isError
            ? 'error loading datasets'
            : datasets?.length
              ? datasets.map(d => d.name).join(', ')
              : '(none received)'}
      </p>
    </div>
  );
};

const name = '★ Name of remote module ★';
const type = 'single-page';
const route = 'remote-module';
export { name, route, type, Page };
