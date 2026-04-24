import { useState, useCallback } from 'react';

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function useDayNavigation() {
  const [currentDate, setCurrentDate] = useState(formatDate(new Date()));

  const goToday = useCallback(() => {
    setCurrentDate(formatDate(new Date()));
  }, []);

  const goPrev = useCallback(() => {
    setCurrentDate(prev => {
      const d = parseDate(prev);
      d.setDate(d.getDate() - 1);
      return formatDate(d);
    });
  }, []);

  const goNext = useCallback(() => {
    setCurrentDate(prev => {
      const d = parseDate(prev);
      d.setDate(d.getDate() + 1);
      return formatDate(d);
    });
  }, []);

  const goToDate = useCallback((dateStr) => {
    setCurrentDate(dateStr);
  }, []);

  const isToday = currentDate === formatDate(new Date());

  return { currentDate, isToday, goToday, goPrev, goNext, goToDate };
}
