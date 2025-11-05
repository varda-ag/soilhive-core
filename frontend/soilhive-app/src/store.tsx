import { createContext, useContext, useState } from "react";

const CountContext: any = createContext([0, () => {}]);

export function CountProvider({ children }: {children: any}) {
  return (
    <CountContext.Provider value={useState(0)}>
      {children}
    </CountContext.Provider>
  );
}

export function useCount() {
  return useContext(CountContext);
}
