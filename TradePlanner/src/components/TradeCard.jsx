import { useRef, useEffect, useState } from 'react';
import Input from './ui/Input';
import Select from './ui/Select';
import TextArea from './ui/TextArea';
import Badge from './ui/Badge';
import Button from './ui/Button';
import { GRADE_OPTIONS, SETUP_TYPES, SIZE_PRESETS } from '../constants';
import { parseR } from '../utils/calculations';

export default function TradeCard({ trade, onUpdate, onDelete, onDuplicate, readOnly, isNew, onDragStart, onDragOver, onDrop, index }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const tickerRef = useRef(null);

  useEffect(() => {
    if (isNew && tickerRef.current) {
      tickerRef.current.focus();
    }
  }, [isNew]);

  const u = (field) => (value) => {
    if (!readOnly) onUpdate(trade.id, field, value);
  };

  const rVal = parseR(trade.rResult);
  const rClass = rVal === null ? '' : rVal > 0 ? 'r-positive' : rVal < 0 ? 'r-negative' : '';

  return (
    <div
      className={`trade-card${trade.collapsed ? ' collapsed' : ''}`}
      draggable={!readOnly}
      onDragStart={() => onDragStart?.(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver?.(index); }}
      onDrop={() => onDrop?.(index)}
    >
      <div className="trade-card-header" onClick={() => onUpdate(trade.id, 'collapsed', !trade.collapsed)}>
        <div className="trade-card-title">
          <span className="ticker">{trade.ticker || 'NEW'}</span>
          {trade.setup && <span className="setup-badge">{trade.setup}</span>}
          {trade.rResult && <span className={`r-result ${rClass}`}>{trade.rResult}</span>}
          {trade.grade && <span className="grade-badge">{trade.grade}</span>}
        </div>
        <div className="trade-card-meta">
          <span className="timestamp">{trade.timestamp}</span>
          <span className="collapse-icon">{trade.collapsed ? '+' : '−'}</span>
        </div>
      </div>

      {!trade.collapsed && (
        <div className="trade-card-body">
          <div className="trade-row">
            <div className="field">
              <label className="field-label">Ticker</label>
              <input
                ref={tickerRef}
                className="field-input mono large"
                value={trade.ticker}
                onChange={e => u('ticker')(e.target.value.toUpperCase())}
                placeholder="TICKER"
                readOnly={readOnly}
              />
            </div>
            <div className="field">
              <label className="field-label">Setup</label>
              <div className="setup-buttons">
                {SETUP_TYPES.map(s => (
                  <Badge key={s} active={trade.setup === s} onClick={() => !readOnly && u('setup')(s)}>
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="trade-row">
            <Select label="Grade" value={trade.grade} onChange={u('grade')} options={GRADE_OPTIONS} placeholder="Grade..." />
            <div className="field">
              <label className="field-label">Size</label>
              <div className="size-buttons">
                {SIZE_PRESETS.map(s => (
                  <Badge key={s} active={trade.size === s} onClick={() => !readOnly && u('size')(s)}>
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
            <Input label="R Result" value={trade.rResult} onChange={u('rResult')} placeholder="+1.76R" mono className="r-input" readOnly={readOnly} />
          </div>

          <TextArea label="Setup Notes" value={trade.setupNotes} onChange={u('setupNotes')} placeholder="Why this ticker, thesis..." rows={2} readOnly={readOnly} />
          <TextArea label="Dilution Notes" value={trade.dilutionNotes} onChange={u('dilutionNotes')} placeholder="Filing/dilution research..." rows={2} readOnly={readOnly} />

          <div className="plan-fields">
            <TextArea
              label="Entry Plan"
              value={trade.entryPlan}
              onChange={u('entryPlan')}
              placeholder="Where to enter, confirmation, risk level..."
              rows={3}
              highlight
              readOnly={readOnly}
            />
            <TextArea
              label="Exit Plan"
              value={trade.exitPlan}
              onChange={u('exitPlan')}
              placeholder="Target levels, partial plan, when to cover..."
              rows={3}
              highlight
              readOnly={readOnly}
            />
          </div>

          <TextArea label="Emotions" value={trade.emotions} onChange={u('emotions')} placeholder="How you felt during this trade..." rows={2} readOnly={readOnly} />
          <TextArea label="Execution Notes" value={trade.executionNotes} onChange={u('executionNotes')} placeholder="What actually happened vs plan..." rows={2} readOnly={readOnly} />

          {!readOnly && (
            <div className="trade-card-actions">
              <Button variant="ghost" onClick={() => onDuplicate(trade.id)}>Duplicate</Button>
              {confirmDelete ? (
                <div className="delete-confirm">
                  <span>Delete this trade?</span>
                  <Button variant="danger" onClick={() => onDelete(trade.id)}>Yes, delete</Button>
                  <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                </div>
              ) : (
                <Button variant="danger-ghost" onClick={() => setConfirmDelete(true)}>Delete</Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
