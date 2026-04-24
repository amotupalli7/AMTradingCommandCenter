import DayNavigation from './components/DayNavigation';
import DayView from './components/DayView';
import { useDayNavigation } from './hooks/useDayNavigation';
import { useTradeData } from './hooks/useTradeData';

export default function App() {
  const { currentDate, isToday, goToday, goPrev, goNext, goToDate } = useDayNavigation();
  const {
    dayData, datesWithData, updateHeader, addTrade, updateTrade,
    deleteTrade, duplicateTrade, reorderTrades, updateSummary,
    getAllData, importAllData,
  } = useTradeData(currentDate);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Trade Planner</h1>
        <DayNavigation
          currentDate={currentDate}
          isToday={isToday}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
          onDateChange={goToDate}
          datesWithData={datesWithData}
        />
      </header>
      <main className="app-main">
        <DayView
          dayData={dayData}
          isToday={isToday}
          updateHeader={updateHeader}
          addTrade={addTrade}
          updateTrade={updateTrade}
          deleteTrade={deleteTrade}
          duplicateTrade={duplicateTrade}
          reorderTrades={reorderTrades}
          updateSummary={updateSummary}
          getAllData={getAllData}
          importAllData={importAllData}
        />
      </main>
    </div>
  );
}
