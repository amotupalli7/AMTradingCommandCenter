"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { TradeFilters, EMPTY_TRADE_FILTERS } from "@/components/FilterBar";

interface FilterContextValue {
  filters: TradeFilters;
  setFilters: (f: TradeFilters) => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<TradeFilters>(EMPTY_TRADE_FILTERS);
  return (
    <FilterContext.Provider value={{ filters, setFilters }}>
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters(): FilterContextValue {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useFilters must be used within FilterProvider");
  return ctx;
}
