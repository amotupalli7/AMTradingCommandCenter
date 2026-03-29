import * as XLSX from 'xlsx';

export function exportJSON(state) {
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `playbook-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importJSON(dispatch) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json';
  inp.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const state = JSON.parse(ev.target.result);
        dispatch({ type: 'IMPORT_STATE', state });
      } catch {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  };
  inp.click();
}

export function exportFilteredJSON(cards, taxonomy) {
  const data = JSON.stringify({ cards, taxonomy }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `playbook-search-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportFilteredXLSX(cards, taxonomy) {
  const wb = XLSX.utils.book_new();

  const allSubSetups = taxonomy.setups.flatMap(s => s.subSetups).filter(
    (sub, idx, arr) => arr.findIndex(s => s.id === sub.id) === idx
  );
  const getSubName = (id) => allSubSetups.find(s => s.id === id)?.name || id;
  const getEntryName = (id) => taxonomy.entryMethods.find(e => e.id === id)?.name || id;
  const getSetupName = (id) => taxonomy.setups.find(s => s.id === id)?.name || id;

  const rows = cards.map(c => ({
    Ticker: c.ticker,
    Date: c.date,
    Direction: c.direction,
    Setup: c.setup ? getSetupName(c.setup) : '',
    'Sub-Setups': (c.subSetups || []).map(getSubName).join(', '),
    'Entry Methods': (c.entryMethods || []).map(getEntryName).join(', '),
    Grade: c.grade || '',
    Notes: c.rawNotes || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Search Results');
  XLSX.writeFile(wb, `playbook-search-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportXLSX(state) {
  const { cards, taxonomy } = state;
  const wb = XLSX.utils.book_new();

  const allSubSetups = taxonomy.setups.flatMap(s => s.subSetups).filter(
    (sub, idx, arr) => arr.findIndex(s => s.id === sub.id) === idx
  );
  const getSubName = (id) => allSubSetups.find(s => s.id === id)?.name || id;
  const getEntryName = (id) => taxonomy.entryMethods.find(e => e.id === id)?.name || id;

  ['short', 'long', 'both'].forEach(dir => {
    const dirCards = cards.filter(c => c.direction === dir);
    if (dirCards.length === 0) return;

    taxonomy.setups.forEach(setup => {
      const setupCards = dirCards.filter(c => c.setup === setup.id);
      if (setupCards.length === 0) return;

      const groups = {};
      setupCards.forEach(card => {
        const subs = card.subSetups || [];
        if (subs.length === 0) {
          if (!groups['General']) groups['General'] = [];
          groups['General'].push(card);
        } else {
          subs.forEach(subId => {
            const name = getSubName(subId);
            if (!groups[name]) groups[name] = [];
            groups[name].push(card);
          });
        }
      });

      Object.entries(groups).forEach(([subName, grpCards]) => {
        const rows = grpCards.map(c => ({
          Ticker: c.ticker,
          Date: c.date,
          Direction: c.direction,
          Setup: setup.name,
          'Sub-Setups': (c.subSetups || []).map(getSubName).join(', '),
          'Entry Methods': (c.entryMethods || []).map(getEntryName).join(', '),
          Grade: c.grade || '',
          Notes: c.rawNotes || '',
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const sheetName = `${dir[0].toUpperCase()}_${setup.name}_${subName}`.slice(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      });
    });
  });

  XLSX.writeFile(wb, `playbook-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
