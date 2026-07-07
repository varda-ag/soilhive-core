import type React from 'react';
import type { MapSelection } from '../contexts';

export interface Plugin {
  url: string; // Remote URL pointing to mf-manifest.json
  enabled: boolean;
  mustBeLoggedIn: boolean;
  enableACL: boolean;
  acl: string[];
}

export enum PluginType {
  SINGLE_PAGE = 'single-page',
  NEW_TAB = 'new-tab',
  MAP_INFO_CARD = 'map-info-card',
}

// Shape of a loaded remote module as consumed across the app.
export interface RemotePlugin {
  type: PluginType;
  name: string;
  description?: string;
  hasMenuItem?: boolean;
  route?: string;
  targetUrl?: string;
  // Specialized plugins below pin the exact component props.
  Page?: React.ComponentType<any>;
}

// A plugin that opens into a routable application page
export interface SinglePagePlugin extends RemotePlugin {
  type: PluginType.SINGLE_PAGE;
  hasMenuItem: true;
  route: string;
  Page: React.ComponentType;
}

// A plugin that opens into a new tab
export interface NewTabPlugin extends RemotePlugin {
  type: PluginType.NEW_TAB;
  hasMenuItem: true;
  targetUrl: string;
}

export interface MapInfoCardProps {
  hasMenuItem: false;
  selection: MapSelection;
  locationName?: string;
}

// A plugin that replaces the info card on map selection
export interface MapInfoCardPlugin extends RemotePlugin {
  type: PluginType.MAP_INFO_CARD;
  Page: React.ComponentType<MapInfoCardProps>;
}
