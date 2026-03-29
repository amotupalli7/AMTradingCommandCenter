"use client";

import { useEffect, useCallback } from "react";

interface UseKeyboardNavOptions {
  tradeIds: number[];
  selectedTradeId: number | null;
  onSelect: (tradeId: number | null) => void;
}

export function useKeyboardNav({
  tradeIds,
  selectedTradeId,
  onSelect,
}: UseKeyboardNavOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Don't navigate when typing in inputs
      if (
        target.tagName === "TEXTAREA" ||
        target.tagName === "INPUT" ||
        target.isContentEditable
      ) {
        return;
      }

      if (!selectedTradeId && tradeIds.length > 0) {
        // If nothing selected, select first on arrow down
        if (e.key === "ArrowDown" || e.key === "ArrowRight") {
          e.preventDefault();
          onSelect(tradeIds[0]);
        }
        return;
      }

      const currentIndex = tradeIds.indexOf(selectedTradeId!);
      if (currentIndex === -1) return;

      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        if (currentIndex < tradeIds.length - 1) {
          onSelect(tradeIds[currentIndex + 1]);
        }
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        if (currentIndex > 0) {
          onSelect(tradeIds[currentIndex - 1]);
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onSelect(null);
      }
    },
    [tradeIds, selectedTradeId, onSelect]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
