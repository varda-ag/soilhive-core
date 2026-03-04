import React, { createContext, useState, type ReactNode, useCallback, useMemo } from 'react';

type DownloadsItem = {
  id: string;
  progress: number;
};

type DownloadsContextType = {
  downloads: DownloadsItem[];
  pushDownload: (file: DownloadsItem) => void;
  cancelDownload: (id: string) => void;
};

export const DownloadsContext = createContext<DownloadsContextType | undefined>(undefined);

type DownloadsProviderProps = {
  children: ReactNode;
};

const mockDownloads: DownloadsItem[] = [
  {
    id: '1',
    progress: 85,
  },
  {
    id: '2',
    progress: 53,
  },
];

export const DownloadsProvider: React.FC<DownloadsProviderProps> = ({ children }) => {
  const [downloads, setDownloads] = useState<DownloadsItem[]>(mockDownloads);

  const pushDownload = useCallback((file: DownloadsItem) => {
    setDownloads(prev => [...prev, file]);
  }, []);

  const cancelDownload = useCallback((id: string) => {
    setDownloads(prev => prev.filter(item => item.id !== id));
  }, []);

  const value = useMemo(() => ({ downloads, pushDownload, cancelDownload }), [downloads, pushDownload, cancelDownload]);

  return <DownloadsContext.Provider value={value}>{children}</DownloadsContext.Provider>;
};
