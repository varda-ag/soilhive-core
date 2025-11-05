import { createContext, useContext, useState, type ReactNode } from "react";

type CountContextType = [number, React.Dispatch<React.SetStateAction<number>>];

const CountContext = createContext<CountContextType>([0, () => {}]);

export function CountProvider({ children }: { children: ReactNode }) {
  return (
    <CountContext.Provider value={useState(0)}>
      {children}
    </CountContext.Provider>
  );
}

export function useCount() {
  return useContext(CountContext);
}