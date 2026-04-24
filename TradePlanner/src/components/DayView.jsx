import { useState, useRef } from 'react';
import DailyHeader from './DailyHeader';
import TradeCard from './TradeCard';
import DaySummary from './DaySummary';
import ExportPanel from './ExportPanel';
import Button from './ui/Button';

export default function DayView({ dayData, isToday, updateHeader, addTrade, updateTrade, deleteTrade, duplicateTrade, reorderTrades, updateSummary, getAllData, importAllData }) {
  const [editMode, setEditMode] = useState(false);
  const [newestTradeId, setNewestTradeId] = useState(null);
  const dragRef = useRef(null);

  const readOnly = !isToday && !editMode;

  const handleAddTrade = () => {
    const id = addTrade();
    setNewestTradeId(id);
  };

  const handleDragStart = (index) => { dragRef.current = index; };
  const handleDragOver = () => {};
  const handleDrop = (toIndex) => {
    const fromIndex = dragRef.current;
    if (fromIndex !== null && fromIndex !== toIndex) {
      reorderTrades(fromIndex, toIndex);
    }
    dragRef.current = null;
  };

  return (
    <div className="day-view">
      {!isToday && (
        <div className="edit-toggle">
          <Button variant={editMode ? 'accent' : 'ghost'} onClick={() => setEditMode(!editMode)}>
            {editMode ? 'Lock Editing' : 'Enable Editing'}
          </Button>
        </div>
      )}

      <DailyHeader header={dayData.header} onUpdate={updateHeader} readOnly={readOnly} />

      <div className="trades-section">
        <div className="trades-header">
          <h3 className="section-title">Trades ({dayData.trades.length})</h3>
          {!readOnly && (
            <Button variant="primary" onClick={handleAddTrade} className="new-trade-btn">
              + New Trade
            </Button>
          )}
        </div>

        {dayData.trades.length === 0 && (
          <div className="empty-trades">
            <p>No trades yet.</p>
            {!readOnly && <p>Hit <strong>+ New Trade</strong> to plan your first trade.</p>}
          </div>
        )}

        {dayData.trades.map((trade, index) => (
          <TradeCard
            key={trade.id}
            trade={trade}
            index={index}
            onUpdate={updateTrade}
            onDelete={deleteTrade}
            onDuplicate={duplicateTrade}
            readOnly={readOnly}
            isNew={trade.id === newestTradeId}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          />
        ))}
      </div>

      <DaySummary trades={dayData.trades} summary={dayData.summary} onUpdate={updateSummary} readOnly={readOnly} />

      <ExportPanel dayData={dayData} getAllData={getAllData} onImport={importAllData} />
    </div>
  );
}
