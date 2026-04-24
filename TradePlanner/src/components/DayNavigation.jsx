import Button from './ui/Button';

export default function DayNavigation({ currentDate, isToday, onPrev, onNext, onToday, onDateChange, datesWithData }) {
  const formatDisplay = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="day-navigation">
      <Button variant="ghost" onClick={onPrev} aria-label="Previous day">&larr;</Button>

      <div className="nav-center">
        <input
          type="date"
          className="date-picker"
          value={currentDate}
          onChange={e => onDateChange(e.target.value)}
        />
        <span className="date-display">{formatDisplay(currentDate)}</span>
        {datesWithData.includes(currentDate) && <span className="has-data-dot" title="Has data" />}
      </div>

      <Button variant="ghost" onClick={onNext} aria-label="Next day">&rarr;</Button>

      {!isToday && (
        <Button variant="accent" onClick={onToday} className="today-btn">Today</Button>
      )}
    </div>
  );
}
