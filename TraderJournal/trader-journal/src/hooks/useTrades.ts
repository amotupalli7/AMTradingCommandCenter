"use client";

import useSWR from "swr";
import { Trade } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useTrades() {
  const { data, error, isLoading, mutate } = useSWR<Trade[]>(
    "/api/trades",
    fetcher
  );

  return {
    trades: data || [],
    isLoading,
    error,
    refresh: mutate,
  };
}

export function useDashboard() {
  const { data, error, isLoading } = useSWR("/api/dashboard", fetcher);

  return {
    stats: data?.stats,
    charts: data?.charts,
    isLoading,
    error,
  };
}
