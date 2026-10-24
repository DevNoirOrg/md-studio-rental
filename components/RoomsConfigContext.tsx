"use client";

import { createContext, useContext } from "react";
import { defaultRoomsConfig, type RoomsConfig } from "@/lib/room-config";

/** A terembeállítások (szerverről betöltve) a kliens komponenseknek. */
const RoomsConfigContext = createContext<RoomsConfig>(defaultRoomsConfig);

export function RoomsConfigProvider({ value, children }: { value: RoomsConfig; children: React.ReactNode }) {
  return <RoomsConfigContext.Provider value={value}>{children}</RoomsConfigContext.Provider>;
}

export function useRoomsConfig(): RoomsConfig {
  return useContext(RoomsConfigContext);
}
