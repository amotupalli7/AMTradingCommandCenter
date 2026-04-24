import { useState, useCallback, useEffect } from 'react';
import { STORAGE_KEY, createEmptyDay, createEmptyTrade } from '../constants';

function loadAllData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAllData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function findPreviousDay(allData, dateStr) {
  const dates = Object.keys(allData).sort();
  const idx = dates.indexOf(dateStr);
  if (idx > 0) return allData[dates[idx - 1]];
  if (idx === -1 && dates.length > 0) return allData[dates[dates.length - 1]];
  return null;
}

export function useTradeData(currentDate) {
  const [allData, setAllData] = useState(loadAllData);

  const dayData = allData[currentDate] || null;

  const ensureDay = useCallback(() => {
    setAllData(prev => {
      if (prev[currentDate]) return prev;
      const prevDay = findPreviousDay(prev, currentDate);
      const newDay = createEmptyDay(currentDate, prevDay);
      const next = { ...prev, [currentDate]: newDay };
      saveAllData(next);
      return next;
    });
  }, [currentDate]);

  useEffect(() => {
    ensureDay();
  }, [ensureDay]);

  const updateHeader = useCallback((field, value) => {
    setAllData(prev => {
      const day = { ...prev[currentDate] };
      day.header = { ...day.header, [field]: value };
      const next = { ...prev, [currentDate]: day };
      saveAllData(next);
      return next;
    });
  }, [currentDate]);

  const addTrade = useCallback(() => {
    const trade = createEmptyTrade();
    setAllData(prev => {
      const day = { ...prev[currentDate] };
      day.trades = [...day.trades, trade];
      const next = { ...prev, [currentDate]: day };
      saveAllData(next);
      return next;
    });
    return trade.id;
  }, [currentDate]);

  const updateTrade = useCallback((tradeId, field, value) => {
    setAllData(prev => {
      const day = { ...prev[currentDate] };
      day.trades = day.trades.map(t =>
        t.id === tradeId ? { ...t, [field]: value } : t
      );
      const next = { ...prev, [currentDate]: day };
      saveAllData(next);
      return next;
    });
  }, [currentDate]);

  const deleteTrade = useCallback((tradeId) => {
    setAllData(prev => {
      const day = { ...prev[currentDate] };
      day.trades = day.trades.filter(t => t.id !== tradeId);
      const next = { ...prev, [currentDate]: day };
      saveAllData(next);
      return next;
    });
  }, [currentDate]);

  const duplicateTrade = useCallback((tradeId) => {
    setAllData(prev => {
      const day = { ...prev[currentDate] };
      const original = day.trades.find(t => t.id === tradeId);
      if (!original) return prev;
      const dup = {
        ...original,
        id: crypto.randomUUID(),
        rResult: '',
        executionNotes: '',
        emotions: '',
        timestamp: new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
        collapsed: false,
      };
      const idx = day.trades.findIndex(t => t.id === tradeId);
      day.trades = [...day.trades.slice(0, idx + 1), dup, ...day.trades.slice(idx + 1)];
      const next = { ...prev, [currentDate]: day };
      saveAllData(next);
      return next;
    });
  }, [currentDate]);

  const reorderTrades = useCallback((fromIndex, toIndex) => {
    setAllData(prev => {
      const day = { ...prev[currentDate] };
      const trades = [...day.trades];
      const [moved] = trades.splice(fromIndex, 1);
      trades.splice(toIndex, 0, moved);
      day.trades = trades;
      const next = { ...prev, [currentDate]: day };
      saveAllData(next);
      return next;
    });
  }, [currentDate]);

  const updateSummary = useCallback((field, value) => {
    setAllData(prev => {
      const day = { ...prev[currentDate] };
      day.summary = { ...day.summary, [field]: value };
      const next = { ...prev, [currentDate]: day };
      saveAllData(next);
      return next;
    });
  }, [currentDate]);

  const getAllData = useCallback(() => allData, [allData]);

  const importAllData = useCallback((data) => {
    const merged = { ...allData, ...data };
    saveAllData(merged);
    setAllData(merged);
  }, [allData]);

  const datesWithData = Object.keys(allData).sort();

  return {
    dayData: allData[currentDate] || createEmptyDay(currentDate),
    datesWithData,
    updateHeader,
    addTrade,
    updateTrade,
    deleteTrade,
    duplicateTrade,
    reorderTrades,
    updateSummary,
    getAllData,
    importAllData,
  };
}
