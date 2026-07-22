import { createContext, useContext, useState, type ReactNode } from 'react';

type TestValueContextType = {
  value: string | undefined;
  setValue: (value: string) => void;
};

const TestValueContext = createContext<TestValueContextType | undefined>(undefined);

export const TestValueProvider = ({ children }: { children: ReactNode }) => {
  const [value, setValue] = useState<string>();

  return <TestValueContext.Provider value={{ value, setValue }}>{children}</TestValueContext.Provider>;
};

export const useTestValue = () => {
  const context = useContext(TestValueContext);
  if (!context) {
    throw new Error('useTestValue must be used within a TestValueProvider');
  }
  return context;
};
