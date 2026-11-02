import { createContext, useContext } from 'react';

export type GatehouseDrawerControl = { open: boolean; setOpen: (open: boolean) => void };

/** Optional controlled state for an embedding surface; the room owns state by default. */
export const GatehouseDrawerState = createContext<GatehouseDrawerControl | undefined>(undefined);

export function useGatehouseDrawer(fallback: GatehouseDrawerControl): GatehouseDrawerControl {
  return useContext(GatehouseDrawerState) ?? fallback;
}
