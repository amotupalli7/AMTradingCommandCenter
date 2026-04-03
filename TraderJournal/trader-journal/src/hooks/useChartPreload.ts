"use client";

import { useEffect, useState, useRef } from "react";

/**
 * Fetches the preload map on mount, then prefetches chart images into browser cache.
 * Returns a map of tradeId → image URL for instant display.
 */
export function useChartPreload() {
  const [chartUrls, setChartUrls] = useState<Record<number, string>>({});
  const prefetched = useRef(false);

  useEffect(() => {
    if (prefetched.current) return;
    prefetched.current = true;

    fetch("/api/charts/preload")
      .then((r) => r.json())
      .then((urls: Record<number, string>) => {
        setChartUrls(urls);

        // Prefetch images into the browser cache using <link rel="prefetch">
        // This runs in the background without blocking the UI
        const entries = Object.values(urls);
        for (const url of entries) {
          const link = document.createElement("link");
          link.rel = "prefetch";
          link.as = "image";
          link.href = url;
          document.head.appendChild(link);
        }
      })
      .catch(() => {
        // Non-critical — charts will still load on demand
      });
  }, []);

  return chartUrls;
}
