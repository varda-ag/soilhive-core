import React, { createContext, useState, type ReactNode } from 'react';

import type { AvailabilityDataset } from 'types/availability';
import type { RasterFilterCategory, SoilProperty, SoilPropertyCategory } from 'types/backend';

type AvailabilityData = {
  soilProperties: SoilProperty[];
  isLoadingSoilProperties: boolean;
  categories: SoilPropertyCategory[];
  isLoadingCategories: boolean;
  rasterCategories: RasterFilterCategory[];
  isLoadingRasterCategories: boolean;
  visibleDatasets: AvailabilityDataset[];
  isLoadingVisibleDatasets: boolean;
};

type AvailabilityDataContextType = AvailabilityData & {
  setAvailabilityData: (data: AvailabilityData) => void;
};

// Loading flags default to true: nothing has been reported yet by AvailabilityContext, which
// only mounts (and starts fetching) on the Availability page, not for every route/plugin.
const defaultAvailabilityData: AvailabilityData = {
  soilProperties: [],
  isLoadingSoilProperties: true,
  categories: [],
  isLoadingCategories: true,
  rasterCategories: [],
  isLoadingRasterCategories: true,
  visibleDatasets: [],
  isLoadingVisibleDatasets: true,
};

export const AvailabilityDataContext = createContext<AvailabilityDataContextType | undefined>(undefined);

type AvailabilityDataProviderProps = {
  children: ReactNode;
};

export const AvailabilityDataProvider: React.FC<AvailabilityDataProviderProps> = ({ children }) => {
  const [availabilityData, setAvailabilityData] = useState<AvailabilityData>(defaultAvailabilityData);

  return (
    <AvailabilityDataContext.Provider value={{ ...availabilityData, setAvailabilityData }}>{children}</AvailabilityDataContext.Provider>
  );
};
