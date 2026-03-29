import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ArrowLeft, BookOpen, Maximize2, TrendingUp, TrendingDown } from 'lucide-react';
import { C, mono, getDirectionColor, getGradeColor } from '../utils/styles.js';
import { Badge } from './ui.jsx';
import { Lightbox } from './ui.jsx';
import CardDetailPanel from './CardDetailPanel.jsx';
import LinkedTickers from './LinkedTickers.jsx';

function parseDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length < 2) return null;
  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  let year = parts[2] ? parseInt(parts[2], 10) : new Date().getFullYear();
  if (year < 100) year += 2000;
  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
  return new Date(year, month - 1, day);
}

export default function PlaybookView({ cards, taxonomy, marketNotes, dispatch }) {
  // Navigation: null → setup list, { setup } → sub-setup list, { setup, subSetup, cardIdx } → carousel
  const [nav, setNav] = useState(null);
  const [editingCard, setEditingCard] = useState(null);
  const [lightboxSrc, setLightboxSrc] = useState(null);

  // Deduplicate sub-setups across all setups
  const allSubSetups = useMemo(() => {
    return taxonomy.setups.flatMap(s => s.subSetups).filter(
      (sub, idx, arr) => arr.findIndex(s => s.id === sub.id) === idx
    );
  }, [taxonomy]);

  const getSubName = (id) => allSubSetups.find(s => s.id === id)?.name || id;
  const getEntryName = (id) => taxonomy.entryMethods.find(e => e.id === id)?.name || id;

  // Keep editingCard in sync
  const liveEditingCard = editingCard ? cards.find(c => c.id === editingCard.id) : null;

  // ─── CAROUSEL DATA ──────────────────────────────────────────────────────
  const carouselCards = useMemo(() => {
    if (!nav?.subSetup) return [];
    const isUnassigned = nav.setup === '__unassigned';

    // Get cards that belong to this setup on the current side
    let setupCards;
    if (isUnassigned) {
      if (nav.side === 'long') {
        setupCards = cards.filter(c => c.direction === 'both' && !c.longSetup);
      } else {
        setupCards = cards.filter(c => !c.setup);
      }
    } else if (nav.side === 'long') {
      setupCards = cards.filter(c => {
        if (c.direction === 'both' && c.longSetup === nav.setup) return true;
        if (c.direction !== 'both' && c.setup === nav.setup) return true;
        return false;
      });
    } else {
      setupCards = cards.filter(c => c.setup === nav.setup);
    }

    let result;
    if (nav.subSetup === '__all') result = setupCards;
    else if (nav.subSetup === '__none') {
      result = setupCards.filter(c => {
        const subs = getCardSubSetupsForSide(c, nav.side);
        return subs.length === 0;
      });
    } else {
      result = setupCards.filter(c => {
        const subs = getCardSubSetupsForSide(c, nav.side);
        return subs.includes(nav.subSetup);
      });
    }
    // Sort by date (newest first)
    return [...result].sort((a, b) => {
      const da = parseDate(a.date);
      const db = parseDate(b.date);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db.getTime() - da.getTime();
    });
  }, [cards, nav, taxonomy]);

  const currentCard = nav?.subSetup ? carouselCards[nav.cardIdx] : null;
  const liveCurrentCard = currentCard ? cards.find(c => c.id === currentCard.id) : null;

  // ─── KEYBOARD NAV ───────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    if (!nav?.subSetup || carouselCards.length === 0) return;
    setNav(prev => ({ ...prev, cardIdx: Math.min(prev.cardIdx + 1, carouselCards.length - 1) }));
  }, [nav, carouselCards]);

  const goPrev = useCallback(() => {
    if (!nav?.subSetup) return;
    setNav(prev => ({ ...prev, cardIdx: Math.max(prev.cardIdx - 1, 0) }));
  }, [nav]);

  const goBack = useCallback(() => {
    if (lightboxSrc) { setLightboxSrc(null); return; }
    if (editingCard) { setEditingCard(null); return; }
    if (nav?.subSetup) { setNav(prev => ({ side: prev.side, setup: prev.setup, subSetup: null, cardIdx: 0 })); return; }
    if (nav?.setup) { setNav(prev => ({ side: prev.side })); return; }
    if (nav?.side) { setNav(null); return; }
  }, [nav, editingCard, lightboxSrc]);

  useEffect(() => {
    const handler = (e) => {
      // Don't capture if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (editingCard || lightboxSrc) return; // let detail panel / lightbox handle keys

      if (e.key === 'ArrowRight' || e.key === 'l') { e.preventDefault(); goNext(); }
      else if (e.key === 'ArrowLeft' || e.key === 'h') { e.preventDefault(); goPrev(); }
      else if (e.key === 'Escape') { e.preventDefault(); goBack(); }
      else if (e.key === 'e' && nav?.subSetup && liveCurrentCard) {
        e.preventDefault();
        setEditingCard(liveCurrentCard);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [goNext, goPrev, goBack, editingCard, lightboxSrc, nav, liveCurrentCard]);

  // ─── RENDER ─────────────────────────────────────────────────────────────
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: C.bg }}>
      <Lightbox
        src={lightboxSrc}
        images={liveCurrentCard ? [liveCurrentCard.images?.oneMin, liveCurrentCard.images?.fiveMin, liveCurrentCard.images?.daily, ...(liveCurrentCard.images?.additional || [])].filter(Boolean) : undefined}
        onClose={() => setLightboxSrc(null)}
      />
      {liveEditingCard && (
        <CardDetailPanel
          card={liveEditingCard}
          taxonomy={taxonomy}
          marketNotes={marketNotes}
          dispatch={dispatch}
          onClose={() => setEditingCard(null)}
        />
      )}

      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        {/* ─── BREADCRUMB ─────────────────────────────────────────── */}
        <Breadcrumb nav={nav} taxonomy={taxonomy} getSubName={getSubName} goBack={goBack} setNav={setNav} />

        {/* ─── LEVEL 0: SIDE SELECTION (Long / Short) ─────────────── */}
        {!nav && (
          <SideList cards={cards} taxonomy={taxonomy} onSelectSide={(side) => setNav({ side })} />
        )}

        {/* ─── LEVEL 1: SETUP LIST (filtered by side) ─────────────── */}
        {nav?.side && !nav.setup && (
          <SetupList cards={cards} taxonomy={taxonomy} side={nav.side}
            onSelectSetup={(id) => setNav({ ...nav, setup: id })} />
        )}

        {/* ─── LEVEL 2: SUB-SETUP LIST FOR A SETUP ───────────────── */}
        {nav?.setup && !nav.subSetup && (
          <SubSetupList
            cards={cards} taxonomy={taxonomy} setupId={nav.setup}
            navSide={nav.side}
            getSubName={getSubName}
            onSelectSubSetup={(subId) => setNav({ ...nav, subSetup: subId, cardIdx: 0 })}
          />
        )}

        {/* ─── LEVEL 3: CARD CAROUSEL ─────────────────────────────── */}
        {nav?.subSetup && (
          <CardCarousel
            cards={carouselCards}
            allCards={cards}
            currentCard={liveCurrentCard}
            cardIdx={nav.cardIdx}
            total={carouselCards.length}
            taxonomy={taxonomy}
            marketNotes={marketNotes}
            dispatch={dispatch}
            navSide={nav.side}
            getSubName={getSubName}
            getEntryName={getEntryName}
            onNext={goNext}
            onPrev={goPrev}
            onEdit={() => liveCurrentCard && setEditingCard(liveCurrentCard)}
            onLightbox={setLightboxSrc}
          />
        )}

        {cards.length === 0 && !nav && (
          <div style={{ textAlign: 'center', padding: 60, color: C.dim }}>
            <BookOpen size={40} color={C.dim} style={{ marginBottom: 12 }} />
            <div style={{ fontSize: '14px' }}>No cards yet</div>
            <div style={{ fontSize: '12px', marginTop: 4 }}>Add cards or load images from your charts folder</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BREADCRUMB ────────────────────────────────────────────────────────────
function Breadcrumb({ nav, taxonomy, getSubName, goBack, setNav }) {
  const setup = nav?.setup ? taxonomy.setups.find(s => s.id === nav.setup) : null;
  const sideColor = nav?.side === 'long' ? C.green : nav?.side === 'short' ? C.red : C.primary;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, minHeight: 32,
    }}>
      <button
        onClick={() => setNav(null)}
        style={{
          background: 'none', border: 'none', color: nav ? C.secondary : C.primary,
          fontSize: '18px', fontWeight: 700, cursor: 'pointer', padding: 0,
        }}
      >
        PlayBook
      </button>
      {nav?.side && (
        <>
          <span style={{ color: C.dim, fontSize: '14px' }}>/</span>
          <button
            onClick={() => setNav({ side: nav.side })}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: nav.setup ? C.secondary : sideColor,
              fontSize: '16px', fontWeight: 600,
            }}
          >
            {nav.side.charAt(0).toUpperCase() + nav.side.slice(1)}
          </button>
        </>
      )}
      {setup && (
        <>
          <span style={{ color: C.dim, fontSize: '14px' }}>/</span>
          <button
            onClick={() => setNav({ side: nav.side, setup: nav.setup })}
            style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              color: nav.subSetup ? C.secondary : setup.color,
              fontSize: '16px', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: setup.color }} />
            {setup.name}
          </button>
        </>
      )}
      {nav?.subSetup && (
        <>
          <span style={{ color: C.dim, fontSize: '14px' }}>/</span>
          <span style={{ color: setup?.color || C.primary, fontSize: '15px', fontWeight: 600 }}>
            {nav.subSetup === '__none' ? 'Uncategorized' : getSubName(nav.subSetup)}
          </span>
        </>
      )}
      {nav && (
        <button
          onClick={goBack}
          style={{
            marginLeft: 'auto', background: C.elevated, border: `1px solid ${C.border}`,
            borderRadius: 5, padding: '4px 10px', color: C.secondary, fontSize: '12px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <ArrowLeft size={12} /> Back
          <span style={{ color: C.dim, fontSize: '10px', marginLeft: 4 }}>Esc</span>
        </button>
      )}
    </div>
  );
}

// ─── LEVEL 0: SIDE SELECTION (Long / Short) ──────────────────────────────
function SideList({ cards, taxonomy, onSelectSide }) {
  const sides = ['short', 'long'];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: 12,
    }}>
      {sides.map(side => {
        const sideSetups = taxonomy.setups.filter(s => (s.side || 'short') === side);
        const sideSetupIds = new Set(sideSetups.map(s => s.id));
        // Cards on Short side: setup matches a short-side setup, or direction is 'both' (short fields always populated)
        // Cards on Long side: setup matches a long-side setup, or direction is 'both' (uses longSetup)
        const sideCards = cards.filter(c => {
          if (sideSetupIds.has(c.setup)) return true;
          if (side === 'long' && c.direction === 'both') return true;
          return false;
        });
        const color = side === 'short' ? C.red : C.green;
        const Icon = side === 'short' ? TrendingDown : TrendingUp;
        const sampleCard = sideCards.find(c => c.images?.oneMin || c.images?.fiveMin || c.images?.daily);
        const sampleImg = sampleCard?.images?.oneMin || sampleCard?.images?.fiveMin || sampleCard?.images?.daily;

        return (
          <SideTile key={side} side={side} count={sideCards.length} color={color}
            Icon={Icon} sampleImg={sampleImg} setupCount={sideSetups.length}
            onClick={() => onSelectSide(side)} />
        );
      })}
    </div>
  );
}

function SideTile({ side, count, color, Icon, sampleImg, setupCount, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? C.elevated : C.surface,
        border: `1px solid ${C.border}`,
        borderBottom: `3px solid ${color}`,
        borderRadius: 8, cursor: 'pointer',
        transition: 'all 150ms ease',
        overflow: 'hidden',
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
    >
      {sampleImg && (
        <div style={{ width: '100%', height: 100, overflow: 'hidden', opacity: 0.5 }}>
          <img src={sampleImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
      <div style={{ padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Icon size={22} color={color} />
          <span style={{ fontSize: '20px', fontWeight: 700, color: C.primary }}>
            {side.charAt(0).toUpperCase() + side.slice(1)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 32 }}>
          <span style={{ ...mono, fontSize: '22px', fontWeight: 700, color }}>{count}</span>
          <span style={{ fontSize: '12px', color: C.dim }}>card{count !== 1 ? 's' : ''}</span>
          <span style={{ fontSize: '11px', color: C.dim, marginLeft: 8 }}>{setupCount} setup{setupCount !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}

// Helper: get the setup ID a card uses for a given side
function getCardSetupForSide(card, side) {
  if (side === 'long' && card.direction === 'both') return card.longSetup;
  return card.setup;
}
// Helper: get the sub-setups a card uses for a given side
function getCardSubSetupsForSide(card, side) {
  if (side === 'long' && card.direction === 'both') return card.longSubSetups || [];
  return card.subSetups || [];
}

// ─── LEVEL 1: SETUP GRID ──────────────────────────────────────────────────
function SetupList({ cards, taxonomy, side, onSelectSetup }) {
  const nativeSetups = taxonomy.setups.filter(s => (s.side || 'short') === side);

  // For the Long side, also show any setup that 'both' cards reference via longSetup
  const otherSetups = side === 'long'
    ? taxonomy.setups.filter(s => (s.side || 'short') !== side &&
        cards.some(c => c.direction === 'both' && c.longSetup === s.id))
    : [];

  const allSetups = [...nativeSetups, ...otherSetups];

  // Cards relevant to this side
  const getSetupCards = (setupId) => {
    return cards.filter(c => {
      if (c.setup === setupId && (side === 'short' || c.direction !== 'both')) return true;
      if (side === 'long' && c.direction === 'both' && c.longSetup === setupId) return true;
      return false;
    });
  };

  // 'both' cards on Long side that have no longSetup assigned yet
  const unassignedBoth = side === 'long'
    ? cards.filter(c => c.direction === 'both' && !c.longSetup)
    : [];

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: 12,
    }}>
      {allSetups.map(setup => {
        const setupCards = getSetupCards(setup.id);
        const count = setupCards.length;
        const sampleCard = setupCards.find(c => c.images?.oneMin || c.images?.fiveMin || c.images?.daily);
        const sampleImg = sampleCard?.images?.oneMin || sampleCard?.images?.fiveMin || sampleCard?.images?.daily;
        return (
          <SetupTile key={setup.id} setup={setup} count={count} sampleImg={sampleImg}
            onClick={() => onSelectSetup(setup.id)} />
        );
      })}

      {/* Cards with setup IDs that don't match any taxonomy setup (only show on short side) */}
      {side === 'short' && (() => {
        const knownIds = new Set(taxonomy.setups.map(s => s.id));
        const orphans = cards.filter(c => c.setup && !knownIds.has(c.setup));
        const orphanGroups = {};
        orphans.forEach(c => {
          if (!orphanGroups[c.setup]) orphanGroups[c.setup] = [];
          orphanGroups[c.setup].push(c);
        });
        return Object.entries(orphanGroups).map(([setupId, groupCards]) => (
          <SetupTile
            key={setupId}
            setup={{ id: setupId, name: setupId, fullName: `Unknown setup: ${setupId}`, color: '#EF4444' }}
            count={groupCards.length} sampleImg={null}
            onClick={() => onSelectSetup(setupId)}
          />
        ));
      })()}

      {/* Unassigned: short side = no setup, long side = 'both' cards with no longSetup */}
      {(() => {
        const unassigned = side === 'short'
          ? cards.filter(c => !c.setup)
          : unassignedBoth;
        if (unassigned.length === 0) return null;
        return (
          <SetupTile
            key="__unassigned"
            setup={{ id: '__unassigned', name: 'Unassigned', fullName: side === 'long' ? 'No long setup assigned' : 'No setup assigned', color: '#6B7280' }}
            count={unassigned.length} sampleImg={null}
            onClick={() => onSelectSetup('__unassigned')}
          />
        );
      })()}
    </div>
  );
}

function SetupTile({ setup, count, sampleImg, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? C.elevated : C.surface,
        border: `1px solid ${C.border}`,
        borderBottom: `3px solid ${setup.color}`,
        borderRadius: 8, cursor: 'pointer',
        transition: 'all 150ms ease',
        overflow: 'hidden',
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
    >
      {sampleImg && (
        <div style={{ width: '100%', height: 100, overflow: 'hidden', opacity: 0.5 }}>
          <img src={sampleImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
      <div style={{ padding: '16px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: setup.color }} />
          <span style={{ fontSize: '16px', fontWeight: 700, color: C.primary }}>{setup.name}</span>
        </div>
        {setup.fullName && setup.fullName !== setup.name && (
          <div style={{ fontSize: '12px', color: C.dim, marginBottom: 8, paddingLeft: 18 }}>{setup.fullName}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 18 }}>
          <span style={{ ...mono, fontSize: '20px', fontWeight: 700, color: setup.color }}>{count}</span>
          <span style={{ fontSize: '12px', color: C.dim }}>card{count !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}

// ─── LEVEL 2: SUB-SETUP LIST ──────────────────────────────────────────────
function SubSetupList({ cards, taxonomy, setupId, navSide, getSubName, onSelectSubSetup }) {
  const setup = taxonomy.setups.find(s => s.id === setupId);
  const isUnassigned = setupId === '__unassigned';

  // Filter cards that belong to this setup on this side
  let setupCards;
  if (isUnassigned) {
    if (navSide === 'long') {
      setupCards = cards.filter(c => c.direction === 'both' && !c.longSetup);
    } else {
      setupCards = cards.filter(c => !c.setup);
    }
  } else if (navSide === 'long') {
    // On Long side: cards whose longSetup matches, plus native long-side setup cards
    setupCards = cards.filter(c => {
      if (c.direction === 'both' && c.longSetup === setupId) return true;
      if (c.direction !== 'both' && c.setup === setupId) return true;
      return false;
    });
  } else {
    setupCards = cards.filter(c => c.setup === setupId);
  }

  // Group by sub-setup — use longSubSetups when viewing 'both' cards on Long side
  const groups = useMemo(() => {
    const map = {};
    const noSubs = [];
    setupCards.forEach(card => {
      const subs = getCardSubSetupsForSide(card, navSide);
      if (subs.length === 0) {
        noSubs.push(card);
      } else {
        subs.forEach(subId => {
          if (!map[subId]) map[subId] = [];
          map[subId].push(card);
        });
      }
    });
    return { map, noSubs };
  }, [setupCards, navSide]);

  const color = setup?.color || '#6B7280';

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
      gap: 10,
    }}>
      {Object.entries(groups.map).map(([subId, subCards]) => {
        const sampleCard = subCards.find(c => c.images?.oneMin || c.images?.fiveMin || c.images?.daily);
        const sampleImg = sampleCard?.images?.oneMin || sampleCard?.images?.fiveMin || sampleCard?.images?.daily;
        return (
          <SubSetupTile key={subId} name={getSubName(subId)} count={subCards.length}
            color={color} sampleImg={sampleImg}
            onClick={() => onSelectSubSetup(subId)} />
        );
      })}
      {groups.noSubs.length > 0 && (
        <SubSetupTile name="Uncategorized" count={groups.noSubs.length}
          color={C.dim} sampleImg={null}
          onClick={() => onSelectSubSetup('__none')} />
      )}

      {/* Also show "All" tile to see every card in this setup */}
      {setupCards.length > 0 && Object.keys(groups.map).length > 0 && (
        <SubSetupTile name="All" count={setupCards.length}
          color={color} sampleImg={null}
          onClick={() => onSelectSubSetup('__all')} isAll />
      )}
    </div>
  );
}

function SubSetupTile({ name, count, color, sampleImg, onClick, isAll }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? C.elevated : C.surface,
        border: `1px solid ${C.border}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 6, cursor: 'pointer',
        transition: 'all 150ms ease',
        overflow: 'hidden',
        opacity: isAll ? 0.7 : 1,
      }}
    >
      {sampleImg && (
        <div style={{ width: '100%', height: 80, overflow: 'hidden', opacity: 0.4 }}>
          <img src={sampleImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: C.primary, marginBottom: 4 }}>{name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ ...mono, fontSize: '16px', fontWeight: 700, color }}>{count}</span>
          <span style={{ fontSize: '11px', color: C.dim }}>card{count !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </div>
  );
}

// ─── LEVEL 3: CARD CAROUSEL ──────────────────────────────────────────────
function CardCarousel({ cards, allCards, currentCard, cardIdx, total, taxonomy, marketNotes, dispatch, navSide, getSubName, getEntryName, onNext, onPrev, onEdit, onLightbox }) {
  // Navigation history for linked tickers
  const [navHistory, setNavHistory] = useState([]);
  const [overrideCardId, setOverrideCardId] = useState(null);

  // Reset override when the parent carousel changes card
  useEffect(() => { setOverrideCardId(null); setNavHistory([]); }, [currentCard?.id]);

  const isViewingLinked = overrideCardId !== null;
  const displayCard = isViewingLinked
    ? allCards.find(c => c.id === overrideCardId) || currentCard
    : currentCard;

  if (!displayCard) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: C.dim }}>
        No cards in this group
      </div>
    );
  }

  const navigateToLinked = (cardId) => {
    setNavHistory(prev => [...prev, overrideCardId]);
    setOverrideCardId(cardId);
  };

  const navigateBack = () => {
    if (navHistory.length === 0) return;
    const prev = navHistory[navHistory.length - 1];
    setNavHistory(h => h.slice(0, -1));
    setOverrideCardId(prev);
  };

  // The card we came from (for "Back to" label)
  const backCard = navHistory.length > 0
    ? (() => {
        const prev = navHistory[navHistory.length - 1];
        if (prev) return allCards.find(c => c.id === prev);
        return currentCard;
      })()
    : null;

  const isBoth = displayCard.direction === 'both';
  const setupId = getCardSetupForSide(displayCard, navSide);
  const setup = taxonomy.setups.find(s => s.id === setupId);
  const displaySubSetups = getCardSubSetupsForSide(displayCard, navSide);
  const displayEntryMethods = navSide === 'long' && isBoth
    ? (displayCard.longEntryMethods || [])
    : (displayCard.entryMethods || []);
  const imgs = displayCard.images || {};
  const hasCharts = imgs.oneMin || imgs.fiveMin || imgs.daily;

  return (
    <div>
      {/* ─── Navigation bar ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
        padding: '10px 16px', background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 8,
      }}>
        {isViewingLinked ? (
          <button onClick={navigateBack} style={{
            background: '#3B82F622', border: '1px solid #3B82F644', borderRadius: 5,
            padding: '4px 10px', color: '#3B82F6', fontSize: '12px', fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <ChevronLeft size={12} /> Back to {backCard?.ticker || 'previous'}
          </button>
        ) : (
          <button onClick={onPrev} disabled={cardIdx === 0}
            style={{
              background: cardIdx === 0 ? C.elevated : C.surface,
              border: `1px solid ${C.border}`, borderRadius: 5,
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: cardIdx === 0 ? 'not-allowed' : 'pointer',
              color: cardIdx === 0 ? C.dim : C.primary,
            }}>
            <ChevronLeft size={16} />
          </button>
        )}

        {/* Ticker + Date */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ ...mono, fontSize: '22px', fontWeight: 700, color: C.primary, letterSpacing: '0.08em' }}>
            {displayCard.ticker}
          </span>
          <span style={{ ...mono, fontSize: '13px', color: C.dim }}>{displayCard.date}</span>
          <Badge color={getDirectionColor(displayCard.direction)}>
            {displayCard.direction?.toUpperCase()}
          </Badge>
          {displayCard.grade && (
            <Badge color={getGradeColor(displayCard.grade)}>{displayCard.grade}</Badge>
          )}
          {isViewingLinked && (
            <Badge color="#3B82F6">LINKED</Badge>
          )}
          {!isViewingLinked && (() => {
            const p = imgs.daily || imgs.oneMin || imgs.fiveMin;
            if (!p) return null;
            const f = decodeURIComponent(p.split('/').pop());
            return <span style={{ ...mono, fontSize: '9px', color: C.dim, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f}>{f}</span>;
          })()}
        </div>

        {/* Counter */}
        {!isViewingLinked && (
          <>
            <span style={{ ...mono, fontSize: '13px', color: C.secondary }}>
              {cardIdx + 1} <span style={{ color: C.dim }}>/</span> {total}
            </span>

            <button onClick={onNext} disabled={cardIdx === total - 1}
              style={{
                background: cardIdx === total - 1 ? C.elevated : C.surface,
                border: `1px solid ${C.border}`, borderRadius: 5,
                width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: cardIdx === total - 1 ? 'not-allowed' : 'pointer',
                color: cardIdx === total - 1 ? C.dim : C.primary,
              }}>
              <ChevronRight size={16} />
            </button>
          </>
        )}
      </div>

      {/* ─── Charts (3 side by side) ─── */}
      {hasCharts && (
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
          marginBottom: 16,
        }}>
          <ChartPanel label="1 Min" src={imgs.oneMin} onLightbox={onLightbox} />
          <ChartPanel label="5 Min" src={imgs.fiveMin} onLightbox={onLightbox} />
          <ChartPanel label="Daily" src={imgs.daily} onLightbox={onLightbox} />
        </div>
      )}

      {/* Additional images */}
      {(imgs.additional || []).length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 8, marginBottom: 16,
        }}>
          {imgs.additional.map((src, i) => (
            <ChartPanel key={i} label={`Extra ${i + 1}`} src={src} onLightbox={onLightbox} />
          ))}
        </div>
      )}

      {/* ─── Card metadata ─── */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16,
      }}>
        {/* Left: tags */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '14px 18px',
        }}>
          {/* Sub-setups */}
          {displaySubSetups.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: C.dim, marginBottom: 6 }}>
                SUB-SETUPS {isBoth && <span style={{ color: navSide === 'long' ? C.green : C.red }}>({navSide})</span>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {displaySubSetups.map(id => (
                  <Badge key={id} color={setup?.color || C.blue}>{getSubName(id)}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Entry Methods */}
          {displayEntryMethods.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: C.dim, marginBottom: 6 }}>
                ENTRY METHODS {isBoth && <span style={{ color: navSide === 'long' ? C.green : C.red }}>({navSide})</span>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {displayEntryMethods.map(id => (
                  <Badge key={id} color="#8B5CF6">{getEntryName(id)}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* Edit button */}
          <button onClick={onEdit} style={{
            marginTop: 4, padding: '6px 14px', background: C.elevated,
            border: `1px solid ${C.border}`, borderRadius: 5,
            color: C.secondary, fontSize: '12px', cursor: 'pointer',
          }}>
            Edit Card <span style={{ color: C.dim, fontSize: '10px', marginLeft: 6 }}>E</span>
          </button>
        </div>

        {/* Right: notes (directly editable) */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '14px 18px', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: C.dim, marginBottom: 6 }}>
            NOTES
          </div>
          <textarea
            value={displayCard.rawNotes || ''}
            onChange={e => dispatch({ type: 'UPDATE_CARD', id: displayCard.id, patch: { rawNotes: e.target.value } })}
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

      {/* ─── Market Condition Notes ─── */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
        padding: '14px 18px', marginBottom: 16,
      }}>
        <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: '#F59E0B', marginBottom: 6 }}>
          MARKET CONDITIONS — {displayCard.date}
        </div>
        <textarea
          value={(marketNotes || {})[displayCard.date] || ''}
          onChange={e => dispatch({ type: 'UPDATE_MARKET_NOTE', date: displayCard.date, note: e.target.value })}
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

      {/* ─── Linked Tickers ─── */}
      <LinkedTickers
        card={displayCard}
        allCards={allCards}
        taxonomy={taxonomy}
        dispatch={dispatch}
        onNavigate={navigateToLinked}
      />

      {/* ─── Keyboard hint ─── */}
      <div style={{
        display: 'flex', justifyContent: 'center', gap: 16, padding: '8px 0',
        fontSize: '11px', color: C.dim,
      }}>
        <span>← → Navigate</span>
        <span>E Edit</span>
        <span>Esc Back</span>
      </div>
    </div>
  );
}

function ChartPanel({ label, src, onLightbox }) {
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
