import { INITIAL_TAXONOMY } from './taxonomy.js';

// ─── SERVER PERSISTENCE ─────────────────────────────────────────────────────
// Cards → data/playbook.json (images stored as file paths, not data URLs)
// Taxonomy → data/taxonomy.json (separate file for safety)

let _saveTimer = null;
const SAVE_DELAY = 1000;

function saveToServer(state) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    Promise.all([
      fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.cards),
      }),
      fetch('/api/taxonomy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.taxonomy),
      }),
      fetch('/api/market-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.marketNotes),
      }),
    ]).catch(err => {
      console.warn('[PlayBook] Auto-save failed:', err.message);
    });
  }, SAVE_DELAY);
}

// Manual save — bypasses debounce, returns a promise
export function saveNow(state) {
  clearTimeout(_saveTimer);
  return Promise.all([
    fetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.cards),
    }),
    fetch('/api/taxonomy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.taxonomy),
    }),
    fetch('/api/market-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state.marketNotes),
    }),
  ]).then(() => ({ ok: true }));
}

// Merge INITIAL_TAXONOMY into saved taxonomy so new sub-setups/entry methods
// added to taxonomy.js appear without losing saved edits (renames, deletions, etc.)
function mergeTaxonomy(saved) {
  if (!saved || !saved.setups) return INITIAL_TAXONOMY;

  const merged = { ...saved };

  // Collect all sub-setup IDs that exist in saved taxonomy
  const savedSubIds = new Set(saved.setups.flatMap(s => s.subSetups.map(sub => sub.id)));

  // Find new sub-setups from INITIAL_TAXONOMY that don't exist in saved
  const newSubs = [];
  for (const setup of INITIAL_TAXONOMY.setups) {
    for (const sub of setup.subSetups) {
      if (!savedSubIds.has(sub.id)) {
        newSubs.push({ ...sub });
        savedSubIds.add(sub.id); // prevent duplicates
      }
    }
  }

  // Add new sub-setups to every saved setup
  if (newSubs.length > 0) {
    console.log('[PlayBook] Merging new sub-setups from taxonomy.js:', newSubs.map(s => s.name));
    merged.setups = merged.setups.map(s => ({
      ...s,
      subSetups: [...s.subSetups, ...newSubs],
    }));
  }

  // Ensure all setups, sub-setups, and entry methods have a side field (default to 'short' for legacy data)
  merged.setups = merged.setups.map(s => ({
    ...s,
    side: s.side || 'short',
    subSetups: s.subSetups.map(sub => ({ ...sub, side: sub.side || 'short' })),
  }));
  merged.entryMethods = (merged.entryMethods || []).map(e => ({ ...e, side: e.side || 'short' }));

  // Find new setups from INITIAL_TAXONOMY that don't exist in saved
  const savedSetupIds = new Set(saved.setups.map(s => s.id));
  const newSetups = INITIAL_TAXONOMY.setups.filter(s => !savedSetupIds.has(s.id));
  if (newSetups.length > 0) {
    console.log('[PlayBook] Merging new setups from taxonomy.js:', newSetups.map(s => s.name));
    merged.setups = [...merged.setups, ...newSetups];
  }

  // Find new entry methods from INITIAL_TAXONOMY that don't exist in saved
  const savedEntryIds = new Set((saved.entryMethods || []).map(e => e.id));
  const newEntries = (INITIAL_TAXONOMY.entryMethods || []).filter(e => !savedEntryIds.has(e.id));
  if (newEntries.length > 0) {
    console.log('[PlayBook] Merging new entry methods from taxonomy.js:', newEntries.map(e => e.name));
    merged.entryMethods = [...(merged.entryMethods || []), ...newEntries];
  }

  return merged;
}

export async function loadFromServer() {
  try {
    const [cardsRes, taxonomyRes, marketNotesRes] = await Promise.all([
      fetch('/api/cards'),
      fetch('/api/taxonomy'),
      fetch('/api/market-notes'),
    ]);
    if (!cardsRes.ok || !taxonomyRes.ok) return null;
    const cards = await cardsRes.json();
    const taxonomy = await taxonomyRes.json();
    const marketNotes = marketNotesRes.ok ? (await marketNotesRes.json()) || {} : {};
    // Clean up: deduplicate additional images, and promote first additional to
    // empty primary slots (e.g. min1.1 → oneMin if no min1 exists)
    const cleanedCards = (Array.isArray(cards) ? cards : []).map(c => {
      if (!c.images) return c;
      let imgs = { ...c.images };
      let changed = false;

      // Deduplicate additional and remove any that match primary slots
      if (imgs.additional?.length > 0) {
        const primary = new Set([imgs.oneMin, imgs.fiveMin, imgs.daily].filter(Boolean));
        const deduped = [...new Set(imgs.additional)].filter(img => !primary.has(img));
        if (deduped.length !== imgs.additional.length) {
          console.log(`[PlayBook] Cleaned ${imgs.additional.length - deduped.length} duplicate images from ${c.ticker}`);
          imgs.additional = deduped;
          changed = true;
        }
      }

      // Promote first additional to oneMin if slot is empty
      if (!imgs.oneMin && imgs.additional?.length > 0) {
        console.log(`[PlayBook] Promoting additional image to 1min slot for ${c.ticker}`);
        imgs.oneMin = imgs.additional[0];
        imgs.additional = imgs.additional.slice(1);
        changed = true;
      }

      return changed ? { ...c, images: imgs } : c;
    });
    return {
      cards: cleanedCards,
      taxonomy: mergeTaxonomy(taxonomy),
      marketNotes,
    };
  } catch { /* ignore */ }
  return null;
}

// ─── REDUCER ────────────────────────────────────────────────────────────────

export function reducer(state, action) {
  let next;
  switch (action.type) {
    case 'UPDATE_CARD':
      next = {
        ...state,
        cards: state.cards.map(c => c.id === action.id ? { ...c, ...action.patch } : c),
      };
      break;
    case 'ADD_CARD':
      next = { ...state, cards: [...state.cards, action.card] };
      break;
    case 'DELETE_CARD':
      next = { ...state, cards: state.cards.filter(c => c.id !== action.id) };
      break;
    case 'ADD_SETUP':
      next = {
        ...state,
        taxonomy: {
          ...state.taxonomy,
          setups: [...state.taxonomy.setups, action.setup],
        },
      };
      break;
    case 'ADD_SUBSETTUP_GLOBAL':
      next = {
        ...state,
        taxonomy: {
          ...state.taxonomy,
          setups: state.taxonomy.setups.map(s => {
            if (s.subSetups.some(sub => sub.id === action.subSetup.id)) return s;
            return { ...s, subSetups: [...s.subSetups, action.subSetup] };
          }),
        },
      };
      break;
    case 'ADD_ENTRY_METHOD':
      next = {
        ...state,
        taxonomy: {
          ...state.taxonomy,
          entryMethods: [...state.taxonomy.entryMethods, action.method],
        },
      };
      break;
    case 'RENAME_SETUP':
      next = {
        ...state,
        taxonomy: {
          ...state.taxonomy,
          setups: state.taxonomy.setups.map(s =>
            s.id === action.id ? { ...s, name: action.name, fullName: action.fullName || action.name } : s
          ),
        },
      };
      break;
    case 'UPDATE_SETUP_SIDE':
      next = {
        ...state,
        taxonomy: {
          ...state.taxonomy,
          setups: state.taxonomy.setups.map(s =>
            s.id === action.id ? { ...s, side: action.side } : s
          ),
        },
      };
      break;
    case 'UPDATE_SUBSETUP_SIDE':
      next = {
        ...state,
        taxonomy: {
          ...state.taxonomy,
          setups: state.taxonomy.setups.map(s => ({
            ...s,
            subSetups: s.subSetups.map(sub =>
              sub.id === action.id ? { ...sub, side: action.side } : sub
            ),
          })),
        },
      };
      break;
    case 'UPDATE_ENTRY_METHOD_SIDE':
      next = {
        ...state,
        taxonomy: {
          ...state.taxonomy,
          entryMethods: state.taxonomy.entryMethods.map(e =>
            e.id === action.id ? { ...e, side: action.side } : e
          ),
        },
      };
      break;
    case 'DELETE_SETUP':
      next = {
        ...state,
        taxonomy: {
          ...state.taxonomy,
          setups: state.taxonomy.setups.filter(s => s.id !== action.id),
        },
        cards: state.cards.map(c => c.setup === action.id ? { ...c, setup: null } : c),
      };
      break;
    case 'RENAME_SUBSETUP':
      next = {
        ...state,
        taxonomy: {
          ...state.taxonomy,
          setups: state.taxonomy.setups.map(s => ({
            ...s,
            subSetups: s.subSetups.map(sub =>
              sub.id === action.id ? { ...sub, name: action.name } : sub
            ),
          })),
        },
      };
      break;
    case 'DELETE_SUBSETUP':
      next = {
        ...state,
        taxonomy: {
          ...state.taxonomy,
          setups: state.taxonomy.setups.map(s => ({
            ...s,
            subSetups: s.subSetups.filter(sub => sub.id !== action.id),
          })),
        },
        cards: state.cards.map(c => ({
          ...c,
          subSetups: (c.subSetups || []).filter(id => id !== action.id),
        })),
      };
      break;
    case 'RENAME_ENTRY_METHOD':
      next = {
        ...state,
        taxonomy: {
          ...state.taxonomy,
          entryMethods: state.taxonomy.entryMethods.map(e =>
            e.id === action.id ? { ...e, name: action.name } : e
          ),
        },
      };
      break;
    case 'DELETE_ENTRY_METHOD':
      next = {
        ...state,
        taxonomy: {
          ...state.taxonomy,
          entryMethods: state.taxonomy.entryMethods.filter(e => e.id !== action.id),
        },
        cards: state.cards.map(c => ({
          ...c,
          entryMethods: (c.entryMethods || []).filter(id => id !== action.id),
        })),
      };
      break;
    case 'IMPORT_STATE':
      next = action.state;
      break;
    case 'BATCH_ADD_CARDS':
      next = { ...state, cards: [...state.cards, ...action.cards] };
      break;
    case 'UPDATE_MARKET_NOTE':
      next = {
        ...state,
        marketNotes: { ...state.marketNotes, [action.date]: action.note },
      };
      break;
    case 'UPDATE_LINKED_TICKERS':
      next = {
        ...state,
        cards: state.cards.map(c =>
          c.id === action.id ? { ...c, linkedTickers: action.linkedTickers } : c
        ),
      };
      break;
    case 'HYDRATE':
      next = action.state;
      break;
    default:
      return state;
  }

  saveToServer(next);
  return next;
}

const defaultState = {
  cards: [],
  taxonomy: INITIAL_TAXONOMY,
  marketNotes: {},
};

export const initialState = defaultState;
