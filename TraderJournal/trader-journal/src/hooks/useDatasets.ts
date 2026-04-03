"use client";

import useSWR from "swr";

export interface Dataset {
  values: Record<string, string>;  // tradeId → value
  options: string[];                // unique values
}

export type Datasets = Record<string, Dataset>;

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useDatasets() {
  const { data, error, isLoading } = useSWR<{ datasets: Datasets }>(
    "/api/data",
    fetcher
  );

  return {
    datasets: data?.datasets ?? {},
    isLoading,
    error,
  };
}
