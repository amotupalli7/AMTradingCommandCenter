let _nextId = Date.now();
export function genId() { return String(_nextId++); }

// Aliases for short filename tokens → sub-setup IDs
const SUB_SETUP_ALIASES = {
  mo: 'market-open',
};

export function matchSubSetupId(name, taxonomy) {
  const lower = name.toLowerCase().replace(/[_-]/g, ' ').trim();
  // Check alias first
  if (SUB_SETUP_ALIASES[lower]) return SUB_SETUP_ALIASES[lower];
  const allSubs = taxonomy.setups.flatMap(s => s.subSetups);
  const found = allSubs.find(
    s => s.name.toLowerCase() === lower || s.id === lower.replace(/\s+/g, '-')
  );
  return found ? found.id : null;
}

// Build setup keywords and multi-word sub-setup phrases from the live taxonomy.
// This way, if you add a new setup or sub-setup in the UI, the loader picks it up.
function buildTaxonomyLookups(taxonomy) {
  // Setup keywords: any setup that isn't 'gus' can appear in filenames
  // Map lowercase name/id → setup id
  const setupKeywords = {};
  for (const s of taxonomy.setups) {
    if (s.id === 'gus') continue; // GUS is the default, never in filename
    setupKeywords[s.id.toLowerCase()] = s.id;
    setupKeywords[s.name.toLowerCase()] = s.id;
  }

  // Sub-setup phrases: build from taxonomy, sorted longest-first for greedy matching
  const allSubs = taxonomy.setups.flatMap(s => s.subSetups).filter(
    (sub, idx, arr) => arr.findIndex(s => s.id === sub.id) === idx
  );
  const multiWordSubs = allSubs
    .filter(s => s.name.includes(' ') || s.id.includes('-'))
    .map(s => s.name.toLowerCase())
    .sort((a, b) => b.length - a.length); // longest first

  return { setupKeywords, multiWordSubs };
}

// Parse image filename: TICKER subsetup_1 subsetup_2 ... MM-DD-YYYY min{1|1.1|1.2|5|D}.ext
// Uses taxonomy parameter to dynamically detect setups and sub-setups.
export function parseImageFilename(filename, taxonomy) {
  const basename = filename.split('/').pop().split('\\').pop();
  const name = basename.replace(/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i, '');
  const parts = name.split(' ').filter(p => p.length > 0);

  if (parts.length < 3) return null;

  const ticker = parts[0].toUpperCase();

  // Find the date part (M-D-YY or MM-DD-YYYY)
  const dateIdx = parts.findIndex(p => /^\d{1,2}-\d{1,2}-\d{2,4}$/.test(p));
  if (dateIdx < 0) return null;
  const dateStr = parts[dateIdx];

  // Find the min part — it's always after the date
  const minIdx = parts.findIndex((p, i) => i > dateIdx && /^min/i.test(p));

  // Check for bookmap files: "book", "book1", "book2", etc.
  const bookIdx = parts.findIndex((p, i) => i > 0 && /^book\d*$/i.test(p));
  const isBookmap = bookIdx >= 0;

  if (minIdx < 0 && !isBookmap) return null;

  let chartType = 'additional';
  const minPart = minIdx >= 0 ? parts[minIdx].toLowerCase() : null;
  if (isBookmap) {
    chartType = 'additional'; // bookmap files always go to extra images
  } else {
    if (minPart === 'min1') chartType = 'oneMin';
    else if (minPart === 'min5') chartType = 'fiveMin';
    else if (minPart === 'mind') chartType = 'daily';
    else if (/^min1\.\d+$/.test(minPart)) chartType = 'oneMin_extra';
  }

  // Words between ticker and date — some are setup names, rest are sub-setups
  // For bookmap files, exclude the "book" token from middle parts
  const middleEnd = isBookmap && bookIdx < dateIdx ? bookIdx : dateIdx;
  const middleParts = parts.slice(1, middleEnd).filter(p => !/^book\d*$/i.test(p));

  // Use taxonomy-driven lookups (or fallback defaults if no taxonomy provided)
  const { setupKeywords, multiWordSubs } = taxonomy
    ? buildTaxonomyLookups(taxonomy)
    : {
        setupKeywords: { ip: 'ip', mdr: 'mdr', d2: 'd2', situational: 'situational' },
        multiWordSubs: ['weak liquidation', 'loose ah', 'adf avoid', 'pipe catalyst'],
      };

  let detectedSetup = 'gus';
  const subSetupParts = [];
  const consumed = new Set();

  // Multi-word matching first (longest phrases first, greedy)
  for (const phrase of multiWordSubs) {
    const phraseWords = phrase.split(' ');
    for (let i = 0; i <= middleParts.length - phraseWords.length; i++) {
      if ([...Array(phraseWords.length)].some((_, j) => consumed.has(i + j))) continue;
      const slice = middleParts.slice(i, i + phraseWords.length).map(w => w.toLowerCase());
      if (slice.join(' ') === phrase) {
        subSetupParts.push(middleParts.slice(i, i + phraseWords.length).join(' '));
        for (let j = i; j < i + phraseWords.length; j++) consumed.add(j);
        break;
      }
    }
  }

  // Single-word: check setup keywords, then treat as sub-setup
  for (let i = 0; i < middleParts.length; i++) {
    if (consumed.has(i)) continue;
    const lower = middleParts[i].toLowerCase();
    if (setupKeywords[lower]) {
      detectedSetup = setupKeywords[lower];
    } else {
      subSetupParts.push(middleParts[i]);
    }
  }

  // Parse date to M/D/YY format
  const dateParts = dateStr.split('-');
  const year = dateParts[2].length === 2 ? dateParts[2] : dateParts[2].slice(-2);
  const shortDate = `${parseInt(dateParts[0])}/${parseInt(dateParts[1])}/${year}`;

  return { ticker, subSetups: subSetupParts, date: dateStr, shortDate, chartType, minPart, setup: detectedSetup };
}

// mode: 'add' (default) — only add new cards/images, skip existing slots
//        'update' — re-parse setup/sub-setups from filenames and replace images
export function loadImagesFromFolder(files, taxonomy, existingCards, mode = 'add') {
  const parsed = [];
  for (const file of files) {
    const info = parseImageFilename(file.name, taxonomy);
    if (!info) {
      console.log('[PlayBook] Skipped file (no parse):', file.name);
      continue;
    }
    console.log('[PlayBook] Parsed:', file.name, '→', info.ticker, info.chartType, info.shortDate, info.subSetups);
    parsed.push({ ...info, file });
  }

  if (parsed.length === 0) {
    console.warn('[PlayBook] No files matched the expected naming format.');
    return { newCards: [], updates: [], metaUpdates: [] };
  }

  // Group by ticker + normalized date → one card per ticker per date
  const groups = {};
  parsed.forEach(p => {
    const key = `${p.ticker}_${p.shortDate}`;
    if (!groups[key]) {
      groups[key] = {
        ticker: p.ticker, date: p.date, shortDate: p.shortDate,
        subSetups: new Set(), images: [], setup: p.setup || 'gus',
      };
    }
    if (p.setup && p.setup !== 'gus') groups[key].setup = p.setup;
    p.subSetups.forEach(s => groups[key].subSetups.add(s));
    groups[key].images.push({ chartType: p.chartType, file: p.file });
  });

  console.log('[PlayBook] Grouped into', Object.keys(groups).length, 'cards:', Object.keys(groups));

  const newCards = [];
  const updates = [];
  const metaUpdates = []; // setup/sub-setup changes to existing cards

  Object.values(groups).forEach(group => {
    // Match sub-setup names to taxonomy IDs
    const matchedSubs = [];
    group.subSetups.forEach(name => {
      const id = matchSubSetupId(name, taxonomy);
      if (id) matchedSubs.push(id);
    });

    const existing = existingCards.find(
      c => c.ticker === group.ticker && c.date === group.shortDate
    );

    if (existing) {
      if (mode === 'update') {
        // Re-apply setup and sub-setups from filename
        const patch = {};
        const detectedSetup = group.setup || 'gus';
        if (existing.setup !== detectedSetup) {
          patch.setup = detectedSetup;
        }
        // Merge sub-setups: keep existing ones, add any new ones from filename
        const existingSubs = new Set(existing.subSetups || []);
        const merged = new Set([...existingSubs, ...matchedSubs]);
        if (merged.size !== existingSubs.size) {
          patch.subSetups = [...merged];
        }
        if (Object.keys(patch).length > 0) {
          metaUpdates.push({ cardId: existing.id, patch });
        }
      }

      // Queue images — in 'update' mode, replace existing slots too
      group.images.forEach(img => {
        const imgs = existing.images || {};
        const slotMap = { oneMin: 'oneMin', fiveMin: 'fiveMin', daily: 'daily' };
        const slot = slotMap[img.chartType];
        if (mode === 'add' && slot && imgs[slot]) {
          console.log(`[PlayBook] Skipping ${existing.ticker} ${img.chartType} — already loaded`);
          return;
        }
        updates.push({ cardId: existing.id, chartType: img.chartType, file: img.file });
      });
    } else {
      const detectedSetup = group.setup || 'gus';
      newCards.push({
        id: genId(),
        ticker: group.ticker,
        date: group.shortDate,
        direction: 'short',
        rawNotes: '',
        grade: null,
        setup: detectedSetup,
        subSetups: matchedSubs,
        entryMethods: [],
        images: { oneMin: null, fiveMin: null, daily: null, additional: [] },
        notes: '',
        _pendingImages: group.images,
      });
    }
  });

  return { newCards, updates, metaUpdates };
}
