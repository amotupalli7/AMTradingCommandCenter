import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Search, Calendar, ChevronLeft, ChevronRight, X, Maximize2, ArrowLeft, Download } from 'lucide-react';
import { C, mono, getDirectionColor, getGradeColor } from '../utils/styles.js';
import { Badge } from './ui.jsx';
import { Lightbox } from './ui.jsx';
import CardDetailPanel from './CardDetailPanel.jsx';
import { exportFilteredJSON, exportFilteredXLSX } from '../utils/exporters.js';
import LinkedTickers from './LinkedTickers.jsx';

// ─── DATE UTILS ──────────────────────────────────────────────────────────────

function parseCardDate(dateStr) {
  if (!dateStr) return null;
  // Supports: M/D/YY, M/D/YYYY, MM/DD/YY, MM/DD/YYYY
  const parts = dateStr.split('/');
  if (parts.length < 2) return null;
  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  let year = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();
  if (year < 100) year += 2000;
  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
  return new Date(year, month - 1, day);
}

function formatDateShort(d) {
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getWeekRange(date) {
  const d = new Date(date);
  const day = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); // Monday
  const end = new Date(start);
  end.setDate(start.getDate() + 4); // Friday
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getMonthRange(year, month) {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function isInRange(date, start, end) {
  return date >= start && date <= end;
}

// ─── CALENDAR COMPONENT ──────────────────────────────────────────────────────

function MiniCalendar({ selectedDate, selectedRange, onSelectDate, onSelectWeek, cardDates, currentMonth, setCurrentMonth }) {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));

  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = lastDay.getDate();

  const weeks = [];
  let currentWeek = new Array(startOffset).fill(null);

  for (let d = 1; d <= daysInMonth; d++) {
    currentWeek.push(d);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) currentWeek.push(null);
    weeks.push(currentWeek);
  }

  // Set of dates that have cards
  const dateHasCards = useMemo(() => {
    const set = new Set();
    cardDates.forEach(d => {
      if (d.getFullYear() === year && d.getMonth() === month) {
        set.add(d.getDate());
      }
    });
    return set;
  }, [cardDates, year, month]);

  const isSelected = (day) => {
    if (!day) return false;
    const d = new Date(year, month, day);
    if (selectedDate && isSameDay(d, selectedDate)) return true;
    if (selectedRange) return isInRange(d, selectedRange.start, selectedRange.end);
    return false;
  };

  const isWeekSelected = (weekDays) => {
    if (!selectedRange) return false;
    const validDays = weekDays.filter(d => d !== null);
    if (validDays.length === 0) return false;
    const firstDayOfWeek = new Date(year, month, validDays[0]);
    const weekRange = getWeekRange(firstDayOfWeek);
    return weekRange.start.getTime() === selectedRange.start.getTime();
  };

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: 16, width: 300,
    }}>
      {/* Month nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={prevMonth} style={calNavBtn}><ChevronLeft size={14} /></button>
        <span style={{ fontSize: '13px', fontWeight: 600, color: C.primary }}>{monthName}</span>
        <button onClick={nextMonth} style={calNavBtn}><ChevronRight size={14} /></button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'auto repeat(7, 1fr)', gap: 0, marginBottom: 4 }}>
        <div style={{ width: 28 }} /> {/* week selector column */}
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} style={{
            textAlign: 'center', fontSize: '10px', fontWeight: 700,
            color: i >= 5 ? C.dim : C.secondary, letterSpacing: '0.05em',
            padding: '2px 0',
          }}>{d}</div>
        ))}
      </div>

      {/* Day grid */}
      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'auto repeat(7, 1fr)', gap: 0 }}>
          {/* Week selector */}
          <button
            onClick={() => {
              const firstValid = week.find(d => d !== null);
              if (firstValid) onSelectWeek(new Date(year, month, firstValid));
            }}
            title="Select week"
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isWeekSelected(week) ? C.blue + '33' : 'transparent',
              border: 'none', borderRadius: 4, cursor: 'pointer',
              color: C.dim, fontSize: '10px',
            }}
          >
            W
          </button>
          {week.map((day, di) => {
            if (day === null) return <div key={di} />;
            const hasCards = dateHasCards.has(day);
            const sel = isSelected(day);
            return (
              <button
                key={di}
                onClick={() => onSelectDate(new Date(year, month, day))}
                style={{
                  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'column', position: 'relative',
                  background: sel ? C.blue + '33' : 'transparent',
                  border: sel ? `1px solid ${C.blue}66` : '1px solid transparent',
                  borderRadius: 4, cursor: 'pointer',
                  color: hasCards ? C.primary : di >= 5 ? C.dim + '66' : C.dim,
                  fontSize: '12px', fontWeight: hasCards ? 700 : 400,
                  ...mono,
                }}
              >
                {day}
                {hasCards && (
                  <div style={{
                    position: 'absolute', bottom: 2,
                    width: 3, height: 3, borderRadius: '50%',
                    background: C.green,
                  }} />
                )}
              </button>
            );
          })}
        </div>
      ))}

      {/* Quick buttons */}
      <div style={{ display: 'flex', gap: 4, marginTop: 12, flexWrap: 'wrap' }}>
        <QuickBtn label="This Month" onClick={() => {
          const now = new Date();
          const range = getMonthRange(now.getFullYear(), now.getMonth());
          onSelectWeek(null); // hack: we'll handle via selectedRange
          // We need a way to set range — use onSelectDate with a special value
        }} />
      </div>
    </div>
  );
}

const calNavBtn = {
  background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 4,
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', color: C.secondary,
};

function QuickBtn({ label, onClick, active }) {
  return (
    <button onClick={onClick} style={{
      padding: '3px 8px', fontSize: '10px', fontWeight: 600,
      background: active ? C.blue + '22' : C.elevated,
      border: `1px solid ${active ? C.blue + '44' : C.border}`,
      borderRadius: 4, cursor: 'pointer',
      color: active ? C.blue : C.secondary,
    }}>{label}</button>
  );
}

// ─── SEARCH RESULT CARD ──────────────────────────────────────────────────────

function SearchResultCard({ card, taxonomy, onClick, onEdit }) {
  const [hovered, setHovered] = useState(false);
  const setup = taxonomy.setups.find(s => s.id === card.setup);
  const allSubs = taxonomy.setups.flatMap(s => s.subSetups).filter(
    (sub, idx, arr) => arr.findIndex(s => s.id === sub.id) === idx
  );
  const getSubName = (id) => allSubs.find(s => s.id === id)?.name || id;
  const getEntryName = (id) => taxonomy.entryMethods.find(e => e.id === id)?.name || id;
  const imgs = card.images || {};
  const thumbSrc = imgs.oneMin || imgs.fiveMin || imgs.daily;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? C.elevated : C.surface,
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${setup?.color || C.dim}`,
        borderRadius: 6, cursor: 'pointer',
        transition: 'all 120ms ease',
        display: 'flex', overflow: 'hidden',
      }}
    >
      {/* Thumbnail */}
      {thumbSrc && (
        <div style={{ width: 120, minHeight: 70, flexShrink: 0, overflow: 'hidden' }}>
          <img src={thumbSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}

      {/* Info */}
      <div style={{ padding: '10px 14px', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ ...mono, fontSize: '16px', fontWeight: 700, color: C.primary, letterSpacing: '0.06em' }}>
            {card.ticker}
          </span>
          <span style={{ ...mono, fontSize: '12px', color: C.dim }}>{card.date}</span>
          <Badge color={getDirectionColor(card.direction)}>{card.direction?.toUpperCase()}</Badge>
          {card.grade && <Badge color={getGradeColor(card.grade)}>{card.grade}</Badge>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {setup && (
            <Badge color={setup.color}>{setup.name}</Badge>
          )}
          {(card.subSetups || []).map(id => (
            <span key={id} style={{ fontSize: '10px', color: C.secondary }}>{getSubName(id)}</span>
          ))}
          {(card.entryMethods || []).length > 0 && (
            <>
              <span style={{ color: C.dim, fontSize: '10px' }}>|</span>
              {card.entryMethods.map(id => (
                <span key={id} style={{ fontSize: '10px', color: '#8B5CF6' }}>{getEntryName(id)}</span>
              ))}
            </>
          )}
        </div>

        {card.rawNotes && (
          <div style={{
            marginTop: 4, fontSize: '11px', color: C.dim,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {card.rawNotes}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CARD DETAIL SLIDESHOW (reused from PlaybookView but standalone) ────────

function CardSlideshow({ cards, allCards, startIdx, taxonomy, marketNotes, dispatch, onClose }) {
  const [idx, setIdx] = useState(startIdx || 0);
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const [editingCard, setEditingCard] = useState(null);
  // Navigation history for linked tickers — stack of { cardId, fromIdx }
  const [navHistory, setNavHistory] = useState([]);
  const [overrideCardId, setOverrideCardId] = useState(null);

  const card = cards[idx];
  const baseCard = card ? cards.find(c => c.id === card.id) || card : null;
  // If viewing a linked ticker, resolve from allCards; otherwise use filtered list card
  const liveCard = overrideCardId
    ? allCards.find(c => c.id === overrideCardId) || baseCard
    : baseCard;

  const isViewingLinked = overrideCardId !== null;

  const allSubs = taxonomy.setups.flatMap(s => s.subSetups).filter(
    (sub, i, arr) => arr.findIndex(s => s.id === sub.id) === i
  );
  const getSubName = (id) => allSubs.find(s => s.id === id)?.name || id;
  const getEntryName = (id) => taxonomy.entryMethods.find(e => e.id === id)?.name || id;
  const setup = liveCard ? taxonomy.setups.find(s => s.id === liveCard.setup) : null;

  const goNext = useCallback(() => {
    if (overrideCardId) return; // disable list nav while viewing linked
    setIdx(i => Math.min(i + 1, cards.length - 1));
  }, [cards.length, overrideCardId]);
  const goPrev = useCallback(() => {
    if (overrideCardId) return;
    setIdx(i => Math.max(i - 1, 0));
  }, [overrideCardId]);

  const navigateToLinked = useCallback((cardId) => {
    // Push current card onto history stack
    setNavHistory(prev => [...prev, { cardId: overrideCardId, idx }]);
    setOverrideCardId(cardId);
  }, [overrideCardId, idx]);

  const navigateBack = useCallback(() => {
    if (navHistory.length === 0) return;
    const prev = navHistory[navHistory.length - 1];
    setNavHistory(h => h.slice(0, -1));
    setOverrideCardId(prev.cardId);
    if (prev.cardId === null) setIdx(prev.idx);
  }, [navHistory]);

  // The card we came from (for "Back to" label)
  const backCard = navHistory.length > 0
    ? (() => {
        const prev = navHistory[navHistory.length - 1];
        if (prev.cardId) return allCards.find(c => c.id === prev.cardId);
        return cards[prev.idx];
      })()
    : null;

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (editingCard || lightboxSrc) return;
      if (e.key === 'ArrowRight' || e.key === 'l') { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft' || e.key === 'h') { e.preventDefault(); goPrev(); }
      else if (e.key === 'Escape') {
        e.preventDefault();
        if (isViewingLinked) navigateBack();
        else onClose();
      }
      else if (e.key === 'e' && liveCard) { e.preventDefault(); setEditingCard(liveCard); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, onClose, editingCard, lightboxSrc, liveCard, isViewingLinked, navigateBack]);

  if (!liveCard) return null;

  const imgs = liveCard.images || {};
  const hasCharts = imgs.oneMin || imgs.fiveMin || imgs.daily;

  return (
    <div>
      <Lightbox
        src={lightboxSrc}
        images={liveCard ? [liveCard.images?.oneMin, liveCard.images?.fiveMin, liveCard.images?.daily, ...(liveCard.images?.additional || [])].filter(Boolean) : undefined}
        onClose={() => setLightboxSrc(null)}
      />
      {editingCard && (
        <CardDetailPanel card={allCards.find(c => c.id === editingCard.id) || editingCard} taxonomy={taxonomy} marketNotes={marketNotes} dispatch={dispatch}
          onClose={() => setEditingCard(null)} />
      )}

      {/* Nav bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
        padding: '10px 16px', background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 8,
      }}>
        {isViewingLinked ? (
          <button onClick={navigateBack} style={{
            background: C.blue + '22', border: `1px solid ${C.blue}44`, borderRadius: 5,
            padding: '4px 10px', color: C.blue, fontSize: '12px', fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <ArrowLeft size={12} /> Back to {backCard?.ticker || 'previous'}
          </button>
        ) : (
          <button onClick={onClose} style={{
            background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 5,
            padding: '4px 10px', color: C.secondary, fontSize: '12px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <ArrowLeft size={12} /> Results
          </button>
        )}

        {!isViewingLinked && (
          <button onClick={goPrev} disabled={idx === 0} style={navBtn(idx === 0)}>
            <ChevronLeft size={16} />
          </button>
        )}

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ ...mono, fontSize: '22px', fontWeight: 700, color: C.primary, letterSpacing: '0.08em' }}>
            {liveCard.ticker}
          </span>
          <span style={{ ...mono, fontSize: '13px', color: C.dim }}>{liveCard.date}</span>
          <Badge color={getDirectionColor(liveCard.direction)}>{liveCard.direction?.toUpperCase()}</Badge>
          {liveCard.grade && <Badge color={getGradeColor(liveCard.grade)}>{liveCard.grade}</Badge>}
          {setup && <Badge color={setup.color}>{setup.name}</Badge>}
          {isViewingLinked && (
            <Badge color={C.blue}>LINKED</Badge>
          )}
        </div>

        {!isViewingLinked && (
          <>
            <span style={{ ...mono, fontSize: '13px', color: C.secondary }}>
              {idx + 1} <span style={{ color: C.dim }}>/</span> {cards.length}
            </span>
            <button onClick={goNext} disabled={idx === cards.length - 1} style={navBtn(idx === cards.length - 1)}>
              <ChevronRight size={16} />
            </button>
          </>
        )}
      </div>

      {/* Charts */}
      {hasCharts && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <ChartImg label="1 Min" src={imgs.oneMin} onLightbox={setLightboxSrc} />
          <ChartImg label="5 Min" src={imgs.fiveMin} onLightbox={setLightboxSrc} />
          <ChartImg label="Daily" src={imgs.daily} onLightbox={setLightboxSrc} />
        </div>
      )}

      {(imgs.additional || []).length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 8, marginBottom: 16 }}>
          {imgs.additional.map((src, i) => <ChartImg key={i} label={`Extra ${i + 1}`} src={src} onLightbox={setLightboxSrc} />)}
        </div>
      )}

      {/* Meta */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 18px' }}>
          {(liveCard.subSetups || []).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: C.dim, marginBottom: 6 }}>SUB-SETUPS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {liveCard.subSetups.map(id => <Badge key={id} color={setup?.color || C.blue}>{getSubName(id)}</Badge>)}
              </div>
            </div>
          )}
          {(liveCard.entryMethods || []).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: C.dim, marginBottom: 6 }}>ENTRY METHODS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {liveCard.entryMethods.map(id => <Badge key={id} color="#8B5CF6">{getEntryName(id)}</Badge>)}
              </div>
            </div>
          )}
          <button onClick={() => setEditingCard(liveCard)} style={{
            marginTop: 4, padding: '6px 14px', background: C.elevated,
            border: `1px solid ${C.border}`, borderRadius: 5,
            color: C.secondary, fontSize: '12px', cursor: 'pointer',
          }}>
            Edit Card <span style={{ color: C.dim, fontSize: '10px', marginLeft: 6 }}>E</span>
          </button>
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 18px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: C.dim, marginBottom: 6 }}>NOTES</div>
          <textarea
            value={liveCard.rawNotes || ''}
            onChange={e => dispatch({ type: 'UPDATE_CARD', id: liveCard.id, patch: { rawNotes: e.target.value } })}
            placeholder="Start typing notes..."
            style={{
              flex: 1, minHeight: 80, width: '100%',
              background: C.elevated, border: `1px solid ${C.border}`,
              borderRadius: 5, color: C.primary, fontSize: '13px',
              padding: '8px 10px', outline: 'none', resize: 'vertical',
              lineHeight: 1.6, boxSizing: 'border-box', fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      {/* Market Condition Notes */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: '14px 18px', marginBottom: 16,
      }}>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: '#F59E0B', marginBottom: 6 }}>
          MARKET CONDITIONS — {liveCard.date}
        </div>
        <textarea
          value={(marketNotes || {})[liveCard.date] || ''}
          onChange={e => dispatch({ type: 'UPDATE_MARKET_NOTE', date: liveCard.date, note: e.target.value })}
          placeholder="How was the overall market today? SPY, sector rotations, news catalysts..."
          style={{
            width: '100%', minHeight: 60,
            background: C.elevated, border: `1px solid ${C.border}`,
            borderRadius: 5, color: C.primary, fontSize: '12px',
            padding: '8px 10px', outline: 'none', resize: 'vertical',
            lineHeight: 1.5, boxSizing: 'border-box', fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Linked Tickers */}
      <LinkedTickers
        card={liveCard}
        allCards={allCards}
        taxonomy={taxonomy}
        dispatch={dispatch}
        onNavigate={navigateToLinked}
      />

      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, padding: '8px 0', fontSize: '11px', color: C.dim }}>
        <span>← → Navigate</span>
        <span>E Edit</span>
        <span>Esc Back</span>
      </div>
    </div>
  );
}

function navBtn(disabled) {
  return {
    background: disabled ? C.elevated : C.surface,
    border: `1px solid ${C.border}`, borderRadius: 5,
    width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    color: disabled ? C.dim : C.primary,
  };
}

function ChartImg({ label, src, onLightbox }) {
  const [hovered, setHovered] = useState(false);
  if (!src) {
    return (
      <div style={{
        aspectRatio: '16/10', background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 6, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: '11px', color: C.dim }}>{label}</span>
        <span style={{ fontSize: '10px', color: C.dim, opacity: 0.5 }}>No chart</span>
      </div>
    );
  }
  return (
    <div
      onClick={() => onLightbox(src)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative', aspectRatio: '16/10', overflow: 'hidden',
        borderRadius: 6, cursor: 'zoom-in', border: `1px solid ${C.border}`,
      }}
    >
      <img src={src} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{
        position: 'absolute', top: 4, left: 6,
        background: '#000000aa', borderRadius: 3,
        padding: '1px 6px', fontSize: '10px', color: C.secondary, ...mono,
      }}>{label}</div>
      {hovered && (
        <div style={{
          position: 'absolute', inset: 0, background: '#00000033',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Maximize2 size={20} color="#fff" />
        </div>
      )}
    </div>
  );
}

// ─── MAIN SEARCH VIEW ────────────────────────────────────────────────────────

export default function SearchView({ cards, taxonomy, marketNotes, dispatch }) {
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // all | day | week | month | range
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedRange, setSelectedRange] = useState(null);
  const [rangeStart, setRangeStart] = useState(null); // for range picking
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [slideshowIdx, setSlideshowIdx] = useState(null); // index into filtered results for slideshow

  // Parse all card dates once
  const cardDates = useMemo(() => {
    return cards.map(c => parseCardDate(c.date)).filter(Boolean);
  }, [cards]);

  // Filter cards
  const filtered = useMemo(() => {
    let result = [...cards];

    // Text search — ticker or notes
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      result = result.filter(c =>
        c.ticker?.toLowerCase().includes(q) ||
        c.rawNotes?.toLowerCase().includes(q) ||
        c.date?.includes(q)
      );
    }

    // Date filter
    if (selectedDate && filterMode === 'day') {
      result = result.filter(c => {
        const d = parseCardDate(c.date);
        return d && isSameDay(d, selectedDate);
      });
    } else if (selectedRange) {
      result = result.filter(c => {
        const d = parseCardDate(c.date);
        return d && isInRange(d, selectedRange.start, selectedRange.end);
      });
    }

    // Sort by date (newest first)
    result.sort((a, b) => {
      const da = parseCardDate(a.date);
      const db = parseCardDate(b.date);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db.getTime() - da.getTime();
    });

    return result;
  }, [cards, query, selectedDate, selectedRange, filterMode]);

  const handleSelectDate = (date) => {
    if (filterMode === 'range') {
      if (!rangeStart) {
        setRangeStart(date);
        setSelectedRange(null);
      } else {
        const start = date < rangeStart ? date : rangeStart;
        const end = date < rangeStart ? rangeStart : date;
        end.setHours(23, 59, 59, 999);
        setSelectedRange({ start, end });
        setRangeStart(null);
      }
    } else {
      setFilterMode('day');
      setSelectedDate(date);
      setSelectedRange(null);
    }
  };

  const handleSelectWeek = (date) => {
    if (!date) return;
    setFilterMode('week');
    const range = getWeekRange(date);
    setSelectedRange(range);
    setSelectedDate(null);
  };

  const handleSelectMonth = () => {
    setFilterMode('month');
    const range = getMonthRange(currentMonth.getFullYear(), currentMonth.getMonth());
    setSelectedRange(range);
    setSelectedDate(null);
  };

  const clearDateFilter = () => {
    setFilterMode('all');
    setSelectedDate(null);
    setSelectedRange(null);
    setRangeStart(null);
  };

  // Active filter label
  const filterLabel = useMemo(() => {
    if (filterMode === 'day' && selectedDate) return `Day: ${formatDateShort(selectedDate)}`;
    if (filterMode === 'week' && selectedRange) return `Week: ${formatDateShort(selectedRange.start)} – ${formatDateShort(selectedRange.end)}`;
    if (filterMode === 'month' && selectedRange) {
      return `Month: ${selectedRange.start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
    }
    if (filterMode === 'range' && selectedRange) return `Range: ${formatDateShort(selectedRange.start)} – ${formatDateShort(selectedRange.end)}`;
    if (filterMode === 'range' && rangeStart) return `Pick end date...`;
    return null;
  }, [filterMode, selectedDate, selectedRange, rangeStart]);

  // If in slideshow mode, show the slideshow
  if (slideshowIdx !== null) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: C.bg }}>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
          <CardSlideshow
            cards={filtered}
            allCards={cards}
            startIdx={slideshowIdx}
            taxonomy={taxonomy}
            marketNotes={marketNotes}
            dispatch={dispatch}
            onClose={() => setSlideshowIdx(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: C.bg }}>
      {/* Fixed header area */}
      <div style={{ flexShrink: 0, padding: '20px 24px 0 24px' }}>
        <div style={{ maxWidth: 1300, margin: '0 auto' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <Search size={18} color={C.secondary} />
            <span style={{ fontSize: '18px', fontWeight: 700, color: C.primary }}>Search</span>
          </div>

          {/* Search bar + controls */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-start' }}>
            {/* Search input */}
            <div style={{ flex: 1 }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} color={C.dim} style={{ position: 'absolute', left: 12, top: 10 }} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search by ticker, notes, or date..."
                  autoFocus
                  style={{
                    width: '100%', padding: '8px 12px 8px 34px',
                    background: C.surface, border: `1px solid ${C.border}`,
                    borderRadius: 6, color: C.primary, fontSize: '14px',
                    outline: 'none', ...mono, boxSizing: 'border-box',
                  }}
                />
                {query && (
                  <button onClick={() => setQuery('')} style={{
                    position: 'absolute', right: 8, top: 8,
                    background: 'none', border: 'none', color: C.dim, cursor: 'pointer',
                  }}>
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Filter pills */}
              <div style={{ display: 'flex', gap: 4, marginTop: 8, alignItems: 'center' }}>
                <button onClick={() => setShowCalendar(!showCalendar)} style={{
                  padding: '4px 10px', background: showCalendar ? C.blue + '22' : C.elevated,
                  border: `1px solid ${showCalendar ? C.blue + '44' : C.border}`,
                  borderRadius: 4, cursor: 'pointer',
                  color: showCalendar ? C.blue : C.secondary,
                  fontSize: '11px', fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <Calendar size={11} /> Calendar
                </button>

                {['day', 'week', 'month', 'range'].map(mode => (
                  <button key={mode} onClick={() => {
                    if (filterMode === mode) {
                      clearDateFilter();
                    } else {
                      setFilterMode(mode);
                      if (mode === 'month') handleSelectMonth();
                      if (mode !== 'range') setRangeStart(null);
                      if (mode === 'range') { setSelectedRange(null); setSelectedDate(null); setRangeStart(null); }
                      if (!showCalendar && (mode === 'day' || mode === 'week' || mode === 'range')) setShowCalendar(true);
                    }
                  }} style={{
                    padding: '4px 8px', fontSize: '10px', fontWeight: 600,
                    background: filterMode === mode ? C.blue + '22' : C.elevated,
                    border: `1px solid ${filterMode === mode ? C.blue + '44' : C.border}`,
                    borderRadius: 4, cursor: 'pointer',
                    color: filterMode === mode ? C.blue : C.secondary,
                    textTransform: 'capitalize',
                  }}>{mode}</button>
                ))}

                {filterLabel && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                    <span style={{ fontSize: '11px', color: C.blue, fontWeight: 600 }}>{filterLabel}</span>
                    <button onClick={clearDateFilter} style={{
                      background: 'none', border: 'none', color: C.dim, cursor: 'pointer', padding: 0,
                    }}>
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Results count + action buttons */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 12,
          }}>
            <span style={{ fontSize: '12px', color: C.secondary }}>
              <span style={{ ...mono, fontWeight: 700, color: C.primary }}>{filtered.length}</span> result{filtered.length !== 1 ? 's' : ''}
            </span>
            {filtered.length > 0 && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setSlideshowIdx(0)} style={{
                  padding: '4px 10px', background: C.elevated,
                  border: `1px solid ${C.border}`, borderRadius: 4,
                  color: C.secondary, fontSize: '11px', cursor: 'pointer',
                }}>
                  Slideshow →
                </button>
                <button onClick={() => exportFilteredJSON(filtered, taxonomy)} style={{
                  padding: '4px 10px', background: C.elevated,
                  border: `1px solid ${C.border}`, borderRadius: 4,
                  color: C.secondary, fontSize: '11px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <Download size={10} /> JSON
                </button>
                <button onClick={() => exportFilteredXLSX(filtered, taxonomy)} style={{
                  padding: '4px 10px', background: C.elevated,
                  border: `1px solid ${C.border}`, borderRadius: 4,
                  color: C.secondary, fontSize: '11px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <Download size={10} /> XLSX
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content area — fills remaining space */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', padding: '0 24px 20px 24px' }}>
        <div style={{ maxWidth: 1300, margin: '0 auto', flex: 1, display: 'flex', gap: 16, overflow: 'hidden' }}>
          {/* Calendar sidebar */}
          {showCalendar && (
            <div style={{ flexShrink: 0 }}>
              <MiniCalendar
                selectedDate={selectedDate}
                selectedRange={selectedRange}
                onSelectDate={handleSelectDate}
                onSelectWeek={handleSelectWeek}
                cardDates={cardDates}
                currentMonth={currentMonth}
                setCurrentMonth={setCurrentMonth}
              />
            </div>
          )}

          {/* Results — scrolls internally */}
          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map((card, i) => (
                <SearchResultCard
                  key={card.id}
                  card={card}
                  taxonomy={taxonomy}
                  onClick={() => setSlideshowIdx(i)}
                />
              ))}

              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: 40, color: C.dim }}>
                  <Search size={32} color={C.dim} style={{ marginBottom: 8 }} />
                  <div style={{ fontSize: '13px' }}>No cards match your search</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
