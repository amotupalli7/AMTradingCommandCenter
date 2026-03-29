import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, X, Search, Link2, ExternalLink } from 'lucide-react';
import { C, mono, getDirectionColor } from '../utils/styles.js';
import { Badge } from './ui.jsx';

// ─── LINKED TICKER POPUP ─────────────────────────────────────────────────────

function LinkedTickerPopup({ card, taxonomy, onClose, onNavigate }) {
  if (!card) return null;

  const setup = taxonomy.setups.find(s => s.id === card.setup);
  const imgs = card.images || {};
  const thumb = imgs.oneMin || imgs.fiveMin || imgs.daily;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000000aa',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 9999,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 520, maxHeight: '70vh', background: C.surface,
        border: `1px solid ${C.border}`, borderRadius: 10,
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 18px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ ...mono, fontSize: '20px', fontWeight: 700, color: C.primary, letterSpacing: '0.06em' }}>
              {card.ticker}
            </span>
            <span style={{ ...mono, fontSize: '12px', color: C.dim }}>{card.date}</span>
            <Badge color={getDirectionColor(card.direction)}>{card.direction?.toUpperCase()}</Badge>
            {setup && <Badge color={setup.color}>{setup.name}</Badge>}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: C.dim, cursor: 'pointer',
          }}>
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '14px 18px', overflowY: 'auto' }}>
          {/* Chart thumbnail */}
          {thumb && (
            <div style={{
              marginBottom: 12, borderRadius: 6, overflow: 'hidden',
              border: `1px solid ${C.border}`,
            }}>
              <img src={thumb} alt="" style={{ width: '100%', height: 200, objectFit: 'cover' }} />
            </div>
          )}

          {/* Notes */}
          {card.rawNotes && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: C.dim, marginBottom: 4 }}>NOTES</div>
              <div style={{
                fontSize: '12px', color: C.secondary, lineHeight: 1.6,
                background: C.elevated, borderRadius: 5, padding: '8px 10px',
                border: `1px solid ${C.border}`,
              }}>
                {card.rawNotes}
              </div>
            </div>
          )}

          {/* Navigate button */}
          {onNavigate && (
            <button onClick={() => { onNavigate(card.id); onClose(); }} style={{
              padding: '8px 16px', background: C.blue + '22',
              border: `1px solid ${C.blue}44`, borderRadius: 5,
              color: C.blue, fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <ExternalLink size={12} /> View Full Card
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TICKER SEARCH DROPDOWN ──────────────────────────────────────────────────

function TickerSearchDropdown({ allCards, currentCardId, existingLinks, onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    const linkedIds = new Set(existingLinks.map(l => l.cardId));
    return allCards
      .filter(c =>
        c.id !== currentCardId &&
        !linkedIds.has(c.id) &&
        (c.ticker?.toLowerCase().includes(q) || c.date?.includes(q))
      )
      .slice(0, 8);
  }, [search, allCards, currentCardId, existingLinks]);

  return (
    <div style={{
      background: C.elevated, border: `1px solid ${C.border}`, borderRadius: 6,
      padding: 8, marginTop: 8,
    }}>
      <div style={{ position: 'relative', marginBottom: 6 }}>
        <Search size={12} color={C.dim} style={{ position: 'absolute', left: 8, top: 8 }} />
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search ticker or date..."
          style={{
            width: '100%', padding: '6px 8px 6px 26px',
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 4, color: C.primary, fontSize: '12px',
            outline: 'none', ...mono, boxSizing: 'border-box',
          }}
        />
        <button onClick={onClose} style={{
          position: 'absolute', right: 4, top: 5,
          background: 'none', border: 'none', color: C.dim, cursor: 'pointer',
        }}>
          <X size={12} />
        </button>
      </div>

      {search.trim() && results.length === 0 && (
        <div style={{ fontSize: '11px', color: C.dim, padding: '6px 4px' }}>No matches</div>
      )}

      {results.map(card => (
        <div
          key={card.id}
          onClick={() => onSelect(card)}
          style={{
            padding: '6px 8px', borderRadius: 4, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            transition: 'background 100ms',
          }}
          onMouseEnter={e => e.currentTarget.style.background = C.surface}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{ ...mono, fontSize: '13px', fontWeight: 700, color: C.primary }}>{card.ticker}</span>
          <span style={{ ...mono, fontSize: '11px', color: C.dim }}>{card.date}</span>
          <Badge color={getDirectionColor(card.direction)}>{card.direction?.toUpperCase()}</Badge>
        </div>
      ))}
    </div>
  );
}

// ─── MAIN LINKED TICKERS SECTION ─────────────────────────────────────────────

export default function LinkedTickers({ card, allCards, taxonomy, dispatch, onNavigate }) {
  const [adding, setAdding] = useState(false);
  const [popupCard, setPopupCard] = useState(null);

  const links = card.linkedTickers || [];

  const addLink = (linkedCard) => {
    const updated = [...links, { cardId: linkedCard.id, notes: '' }];
    dispatch({ type: 'UPDATE_LINKED_TICKERS', id: card.id, linkedTickers: updated });
    setAdding(false);
  };

  const removeLink = (cardId) => {
    const updated = links.filter(l => l.cardId !== cardId);
    dispatch({ type: 'UPDATE_LINKED_TICKERS', id: card.id, linkedTickers: updated });
  };

  const updateLinkNotes = (cardId, notes) => {
    const updated = links.map(l => l.cardId === cardId ? { ...l, notes } : l);
    dispatch({ type: 'UPDATE_LINKED_TICKERS', id: card.id, linkedTickers: updated });
  };

  const resolveCard = (cardId) => allCards.find(c => c.id === cardId);

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
      padding: '14px 18px', marginBottom: 16,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: links.length > 0 || adding ? 10 : 0,
      }}>
        <div style={{
          fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: '#3B82F6',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Link2 size={12} /> LINKED TICKERS
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} style={{
            padding: '3px 10px', background: C.elevated,
            border: `1px solid ${C.border}`, borderRadius: 4,
            color: C.secondary, fontSize: '10px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Plus size={10} /> Add
          </button>
        )}
      </div>

      {/* Existing links — two column layout */}
      {links.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {links.map(link => {
            const linked = resolveCard(link.cardId);
            if (!linked) return null;
            const linkedSetup = taxonomy.setups.find(s => s.id === linked.setup);

            return (
              <div key={link.cardId} style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
                background: C.elevated, borderRadius: 6, padding: '10px 12px',
                border: `1px solid ${C.border}`,
              }}>
                {/* Left: Notes */}
                <div>
                  <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: C.dim, marginBottom: 4 }}>NOTES</div>
                  <textarea
                    value={link.notes}
                    onChange={e => updateLinkNotes(link.cardId, e.target.value)}
                    placeholder="Why is this linked..."
                    style={{
                      width: '100%', minHeight: 50,
                      background: C.surface, border: `1px solid ${C.border}`,
                      borderRadius: 4, color: C.primary, fontSize: '11px',
                      padding: '6px 8px', outline: 'none', resize: 'vertical',
                      lineHeight: 1.5, boxSizing: 'border-box', fontFamily: 'inherit',
                    }}
                  />
                </div>

                {/* Right: Linked ticker card */}
                <div>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 6,
                  }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em', color: C.dim }}>LINKED TICKER</div>
                    <button onClick={() => removeLink(link.cardId)} style={{
                      background: 'none', border: 'none', color: C.dim, cursor: 'pointer', padding: 0,
                    }}>
                      <X size={11} />
                    </button>
                  </div>
                  <div
                    onClick={() => setPopupCard(linked)}
                    style={{
                      background: C.surface, border: `1px solid ${C.border}`,
                      borderLeft: `3px solid ${linkedSetup?.color || C.dim}`,
                      borderRadius: 5, padding: '8px 10px', cursor: 'pointer',
                      transition: 'border-color 120ms',
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = C.blue}
                    onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ ...mono, fontSize: '14px', fontWeight: 700, color: C.primary }}>
                        {linked.ticker}
                      </span>
                      <span style={{ ...mono, fontSize: '11px', color: C.dim }}>{linked.date}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Badge color={getDirectionColor(linked.direction)}>{linked.direction?.toUpperCase()}</Badge>
                      {linkedSetup && <Badge color={linkedSetup.color}>{linkedSetup.name}</Badge>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Search dropdown for adding */}
      {adding && (
        <TickerSearchDropdown
          allCards={allCards}
          currentCardId={card.id}
          existingLinks={links}
          onSelect={addLink}
          onClose={() => setAdding(false)}
        />
      )}

      {/* Popup for viewing linked card */}
      {popupCard && (
        <LinkedTickerPopup
          card={popupCard}
          taxonomy={taxonomy}
          onClose={() => setPopupCard(null)}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}
