import TextArea from './ui/TextArea';
import { calculateSummary } from '../utils/calculations';

export default function DaySummary({ trades, summary, onUpdate, readOnly }) {
  const stats = calculateSummary(trades);

  return (
    <div className="day-summary">
      <h3 className="section-title">End of Day</h3>

      <div className="stats-grid">
        <div className="stat">
          <span className="stat-label">Total R</span>
          <span className={`stat-value mono ${stats.totalR > 0 ? 'r-positive' : stats.totalR < 0 ? 'r-negative' : ''}`}>
            {stats.totalR > 0 ? '+' : ''}{stats.totalR.toFixed(2)}R
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Win/Loss</span>
          <span className="stat-value">{stats.wins}W / {stats.losses}L</span>
        </div>
        <div className="stat">
          <span className="stat-label">Win Rate</span>
          <span className="stat-value">{stats.winRate.toFixed(0)}%</span>
        </div>
        {stats.bestTrade && (
          <div className="stat">
            <span className="stat-label">Best Trade</span>
            <span className="stat-value mono r-positive">{stats.bestTrade.ticker} ({stats.bestTrade.rResult})</span>
          </div>
        )}
        {stats.worstTrade && (
          <div className="stat">
            <span className="stat-label">Worst Trade</span>
            <span className="stat-value mono r-negative">{stats.worstTrade.ticker} ({stats.worstTrade.rResult})</span>
          </div>
        )}
      </div>

      <TextArea
        label="What I Did Well"
        value={summary.whatDidWell}
        onChange={v => onUpdate('whatDidWell', v)}
        placeholder="Wins, discipline, good reads..."
        rows={3}
        readOnly={readOnly}
      />
      <TextArea
        label="What I Learned"
        value={summary.whatLearned}
        onChange={v => onUpdate('whatLearned', v)}
        placeholder="Key takeaways..."
        rows={3}
        readOnly={readOnly}
      />
      <TextArea
        label="What I Need to Improve"
        value={summary.whatToImprove}
        onChange={v => onUpdate('whatToImprove', v)}
        placeholder="Areas for growth..."
        rows={3}
        readOnly={readOnly}
      />
    </div>
  );
}
