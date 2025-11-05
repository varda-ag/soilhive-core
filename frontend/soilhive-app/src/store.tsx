import { createContext, useContext } from "react";

const CountContext: any = createContext([0, () => {}]);

export function CountProvider({ children, value }: {children: any, value: any}) {
  return (
    <CountContext.Provider value={value}>
      {children}
    </CountContext.Provider>
  );
}

export function useCount() {
  return useContext(CountContext);
}
