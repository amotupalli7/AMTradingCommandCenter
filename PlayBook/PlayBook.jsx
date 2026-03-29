import React, { useReducer, useState, useCallback, useEffect } from 'react';
import { TrendingDown, BookOpen, PlusCircle, Search, FolderOpen, RefreshCw, Upload, Download, Save, X, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { C, base, mono } from './src/utils/styles.js';
import { reducer, initialState, loadFromServer, saveNow } from './src/utils/reducer.js';
import { loadImagesFromFolder } from './src/utils/helpers.js';
import { exportJSON, importJSON, exportXLSX } from './src/utils/exporters.js';
import PlaybookView from './src/components/PlaybookView.jsx';
import AddCardPage from './src/components/AddCardPage.jsx';
import TaxonomySidebar from './src/components/TaxonomySidebar.jsx';
import SearchView from './src/components/SearchView.jsx';

function assignImageToCard(card, chartType, imgPath, mode = 'add') {
  if (chartType === 'oneMin') {
    if (!card.images.oneMin || mode === 'update') card.images.oneMin = imgPath;
    else card.images.additional.push(imgPath); // slot taken, not updating → extra
  } else if (chartType === 'fiveMin') {
    if (!card.images.fiveMin || mode === 'update') card.images.fiveMin = imgPath;
    else card.images.additional.push(imgPath);
  } else if (chartType === 'daily') {
    if (!card.images.daily || mode === 'update') card.images.daily = imgPath;
    else card.images.additional.push(imgPath);
  } else if (chartType === 'oneMin_extra') {
    // If no 1min chart yet, promote the first extra to the primary slot
    if (!card.images.oneMin) {
      card.images.oneMin = imgPath;
    } else if (!card.images.additional.includes(imgPath)) {
      card.images.additional.push(imgPath);
    }
  } else {
    if (!card.images.additional.includes(imgPath)) card.images.additional.push(imgPath);
  }
}

// ─── LOAD STATUS OVERLAY ─────────────────────────────────────────────────────
function LoadStatusOverlay({ status, onClose }) {
  if (!status) return null;

  const { phase, progress, total, currentFile, results, error } = status;
  const isDone = phase === 'done' || phase === 'error';

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000000aa',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 10000,
    }}>
      <div style={{
        width: 480, maxHeight: '70vh', background: C.surface,
        border: `1px solid ${C.border}`, borderRadius: 10,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          {phase === 'loading' && <Loader size={16} color={C.amber} style={{ animation: 'spin 1s linear infinite' }} />}
          {phase === 'done' && <CheckCircle size={16} color={C.green} />}
          {phase === 'error' && <AlertCircle size={16} color={C.red} />}
          <span style={{ fontSize: '14px', fontWeight: 700, color: C.primary, flex: 1 }}>
            {phase === 'loading' ? 'Loading Charts...' : phase === 'done' ? 'Charts Loaded' : 'Load Error'}
          </span>
          {isDone && (
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer' }}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* Progress */}
        {phase === 'loading' && (
          <div style={{ padding: '12px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: '12px', color: C.secondary }}>{currentFile || 'Processing...'}</span>
              <span style={{ fontSize: '12px', color: C.dim, ...mono }}>{progress}/{total}</span>
            </div>
            <div style={{ height: 4, background: C.elevated, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                width: total > 0 ? `${(progress / total) * 100}%` : '0%',
                height: '100%', background: C.amber, borderRadius: 2,
                transition: 'width 200ms ease',
              }} />
            </div>
          </div>
        )}

        {/* Results */}
        {phase === 'done' && results && (
          <div style={{ padding: '12px 20px', overflowY: 'auto' }}>
            {/* Summary */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{
                flex: 1, padding: '8px 12px', background: C.elevated,
                borderRadius: 6, borderLeft: `3px solid ${C.green}`,
              }}>
                <div style={{ fontSize: '10px', color: C.dim, marginBottom: 2 }}>CARDS CREATED</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: C.green, ...mono }}>{results.cardsCreated}</div>
              </div>
              <div style={{
                flex: 1, padding: '8px 12px', background: C.elevated,
                borderRadius: 6, borderLeft: `3px solid ${C.blue}`,
              }}>
                <div style={{ fontSize: '10px', color: C.dim, marginBottom: 2 }}>IMAGES LOADED</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: C.blue, ...mono }}>{results.imagesLoaded}</div>
              </div>
              {results.metaUpdated > 0 && (
                <div style={{
                  flex: 1, padding: '8px 12px', background: C.elevated,
                  borderRadius: 6, borderLeft: `3px solid #8B5CF6`,
                }}>
                  <div style={{ fontSize: '10px', color: C.dim, marginBottom: 2 }}>UPDATED</div>
                  <div style={{ fontSize: '18px', fontWeight: 700, color: '#8B5CF6', ...mono }}>{results.metaUpdated}</div>
                </div>
              )}
              <div style={{
                flex: 1, padding: '8px 12px', background: C.elevated,
                borderRadius: 6, borderLeft: `3px solid ${results.skipped > 0 ? C.amber : C.dim}`,
              }}>
                <div style={{ fontSize: '10px', color: C.dim, marginBottom: 2 }}>SKIPPED</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: results.skipped > 0 ? C.amber : C.dim, ...mono }}>{results.skipped}</div>
              </div>
            </div>

            {/* Per-card breakdown */}
            {results.cardDetails.length > 0 && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: C.dim, letterSpacing: '0.1em', marginBottom: 6 }}>CARDS</div>
                {results.cardDetails.map((d, i) => (
                  <div key={i} style={{
                    padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 8,
                    borderBottom: `1px solid ${C.border}`, fontSize: '12px',
                  }}>
                    <CheckCircle size={12} color={C.green} />
                    <span style={{ ...mono, color: C.primary, fontWeight: 600 }}>{d.ticker}</span>
                    <span style={{ color: C.dim, ...mono, fontSize: '11px' }}>{d.date}</span>
                    <span style={{ color: C.secondary, fontSize: '11px', marginLeft: 'auto' }}>
                      {d.chartCount} chart{d.chartCount !== 1 ? 's' : ''}
                    </span>
                    {d.subSetups.length > 0 && (
                      <span style={{ color: C.dim, fontSize: '10px' }}>
                        [{d.subSetups.join(', ')}]
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Skipped files */}
            {results.skippedFiles.length > 0 && (
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: C.amber, letterSpacing: '0.1em', marginBottom: 6 }}>
                  SKIPPED FILES (naming format not recognized)
                </div>
                {results.skippedFiles.slice(0, 10).map((f, i) => (
                  <div key={i} style={{ padding: '2px 8px', fontSize: '11px', color: C.dim }}>
                    {f}
                  </div>
                ))}
                {results.skippedFiles.length > 10 && (
                  <div style={{ padding: '2px 8px', fontSize: '11px', color: C.dim }}>
                    ...and {results.skippedFiles.length - 10} more
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div style={{ padding: '12px 20px', color: C.red, fontSize: '12px' }}>
            {error}
          </div>
        )}

        {/* Close button when done */}
        {isDone && (
          <div style={{ padding: '12px 20px', borderTop: `1px solid ${C.border}` }}>
            <button
              onClick={onClose}
              style={{
                width: '100%', padding: '8px', background: C.green + '22',
                border: `1px solid ${C.green}44`, borderRadius: 6,
                color: C.green, fontSize: '13px', fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        )}
      </div>

      {/* Spin animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function PlayBook() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [view, setView] = useState('playbook');
  const [loadStatus, setLoadStatus] = useState(null);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'

  const handleManualSave = useCallback(async () => {
    setSaveStatus('saving');
    try {
      await saveNow(state);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [state]);

  // Hydrate from server-saved JSON on mount
  useEffect(() => {
    loadFromServer().then(saved => {
      if (saved) dispatch({ type: 'HYDRATE', state: saved });
    });
  }, []);

  // Ctrl+S to save
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleManualSave]);

  const { cards, taxonomy } = state;

  // mode: 'add' — only add new cards/images (default)
  //        'update' — re-parse everything, update setup/sub-setups and replace images
  const handleLoadFolder = useCallback((mode = 'add') => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = true;
    inp.accept = 'image/*';
    inp.webkitdirectory = true;

    inp.onchange = async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      try {
        setLoadStatus({ phase: 'loading', progress: 0, total: files.length, currentFile: 'Parsing filenames...' });

        const { newCards, updates, metaUpdates } = loadImagesFromFolder(files, taxonomy, cards, mode);

        const skippedFiles = [];
        const { parseImageFilename } = await import('./src/utils/helpers.js');
        for (const file of files) {
          const info = parseImageFilename(file.name, taxonomy);
          if (!info) skippedFiles.push(file.name);
        }

        const totalImages = newCards.reduce((sum, c) => sum + c._pendingImages.length, 0) + updates.length;
        let loadedCount = 0;

        // Apply meta updates first (setup/sub-setup changes to existing cards)
        for (const mu of metaUpdates) {
          dispatch({ type: 'UPDATE_CARD', id: mu.cardId, patch: mu.patch });
        }

        // Process new cards
        const processedCards = [];
        for (const card of newCards) {
          const pending = card._pendingImages;
          delete card._pendingImages;

          for (const img of pending) {
            loadedCount++;
            setLoadStatus({
              phase: 'loading', progress: loadedCount, total: totalImages,
              currentFile: `${card.ticker} ${card.date} — ${img.chartType}`,
            });
            const imgPath = `/charts/${encodeURIComponent(img.file.name)}`;
            assignImageToCard(card, img.chartType, imgPath);
          }
          processedCards.push(card);
        }

        if (processedCards.length > 0) {
          dispatch({ type: 'BATCH_ADD_CARDS', cards: processedCards });
        }

        // Process image updates to existing cards
        // Split updates: ones for just-created cards vs truly existing cards
        for (const upd of updates) {
          loadedCount++;
          setLoadStatus({
            phase: 'loading', progress: loadedCount, total: totalImages,
            currentFile: `Updating existing card...`,
          });
          const imgPath = `/charts/${encodeURIComponent(upd.file.name)}`;

          // Check if this update targets a card we just created in this batch
          const newCard = processedCards.find(c => c.id === upd.cardId);
          if (newCard) {
            // Apply directly to the card object (it hasn't been dispatched yet... or just was)
            assignImageToCard(newCard, upd.chartType, imgPath, mode);
            dispatch({ type: 'UPDATE_CARD', id: upd.cardId, patch: { images: { ...newCard.images } } });
            continue;
          }

          const card = cards.find(c => c.id === upd.cardId);
          if (!card) continue;
          const imgs = {
            oneMin: card.images?.oneMin || null,
            fiveMin: card.images?.fiveMin || null,
            daily: card.images?.daily || null,
            additional: [...(card.images?.additional || [])],
          };
          const wrapper = { images: imgs };
          assignImageToCard(wrapper, upd.chartType, imgPath, mode);
          dispatch({ type: 'UPDATE_CARD', id: upd.cardId, patch: { images: wrapper.images } });
        }

        // Build results
        const cardDetails = processedCards.map(c => ({
          ticker: c.ticker,
          date: c.date,
          chartCount: [c.images.oneMin, c.images.fiveMin, c.images.daily].filter(Boolean).length + c.images.additional.length,
          subSetups: c.subSetups || [],
        }));

        setLoadStatus({
          phase: 'done',
          results: {
            cardsCreated: processedCards.length,
            imagesLoaded: loadedCount,
            skipped: skippedFiles.length,
            metaUpdated: metaUpdates.length,
            cardDetails,
            skippedFiles,
          },
        });

      } catch (err) {
        console.error('[PlayBook] Load error:', err);
        setLoadStatus({ phase: 'error', error: err.message });
      }
    };
    inp.click();
  }, [taxonomy, cards]);

  return (
    <div style={{
      ...base, background: C.bg,
      height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <LoadStatusOverlay status={loadStatus} onClose={() => setLoadStatus(null)} />

      {/* Top Bar */}
      <div style={{
        background: C.surface,
        borderBottom: `1px solid ${C.border}`,
        padding: '0 16px', height: 48,
        display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <TrendingDown size={16} color={C.red} />
          <span style={{ ...mono, fontSize: '14px', fontWeight: 700, color: C.primary, letterSpacing: '0.1em' }}>
            PLAYBOOK
          </span>
        </div>

        <div style={{ display: 'flex', gap: 2, background: C.elevated, borderRadius: 5, padding: 2 }}>
          {[
            { id: 'playbook', label: 'PlayBook', icon: <BookOpen size={13} /> },
            { id: 'search', label: 'Search', icon: <Search size={13} /> },
            { id: 'add', label: 'Add Card', icon: <PlusCircle size={13} /> },
          ].map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              style={{
                padding: '4px 12px', borderRadius: 4, border: 'none',
                background: view === id ? C.surface : 'transparent',
                color: view === id ? C.primary : C.dim,
                fontSize: '12px', fontWeight: view === id ? 600 : 400,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                transition: 'all 150ms ease',
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <span style={{ ...mono, fontSize: '11px', color: C.secondary }}>
            {cards.length} cards
          </span>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={handleManualSave}
            title="Save to data/playbook.json (Ctrl+S)"
            style={{
              padding: '5px 10px',
              background: saveStatus === 'saved' ? C.green + '22' : saveStatus === 'error' ? C.red + '22' : C.elevated,
              border: `1px solid ${saveStatus === 'saved' ? C.green + '44' : saveStatus === 'error' ? C.red + '44' : C.border}`,
              borderRadius: 5,
              color: saveStatus === 'saved' ? C.green : saveStatus === 'error' ? C.red : C.secondary,
              fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              transition: 'all 150ms ease',
            }}
          >
            {saveStatus === 'saving' ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> :
             saveStatus === 'saved' ? <CheckCircle size={12} /> :
             <Save size={12} />}
            {saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Error' : 'Save'}
          </button>
          <TopBarButton onClick={() => handleLoadFolder('add')} icon={<FolderOpen size={12} />} label="Load Charts" title="Add new charts (skip existing)" />
          <TopBarButton onClick={() => handleLoadFolder('update')} icon={<RefreshCw size={12} />} label="Reload" title="Re-scan charts: update setups/sub-setups and replace images" />
          <TopBarButton onClick={() => importJSON(dispatch)} icon={<Upload size={12} />} label="Import" />
          <TopBarButton onClick={() => exportJSON(state)} icon={<Download size={12} />} label="JSON" />
          <button
            onClick={() => exportXLSX(state)}
            style={{
              padding: '5px 10px',
              background: C.green + '22',
              border: `1px solid ${C.green}44`,
              borderRadius: 5,
              color: C.green, fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Download size={12} /> XLSX
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {view === 'playbook' && (
          <>
            <PlaybookView cards={cards} taxonomy={taxonomy} marketNotes={state.marketNotes || {}} dispatch={dispatch} />
            <TaxonomySidebar taxonomy={taxonomy} cards={cards} dispatch={dispatch} />
          </>
        )}
        {view === 'search' && (
          <>
            <SearchView cards={cards} taxonomy={taxonomy} marketNotes={state.marketNotes || {}} dispatch={dispatch} />
            <TaxonomySidebar taxonomy={taxonomy} cards={cards} dispatch={dispatch} />
          </>
        )}
        {view === 'add' && (
          <>
            <AddCardPage taxonomy={taxonomy} dispatch={dispatch} />
            <TaxonomySidebar taxonomy={taxonomy} cards={cards} dispatch={dispatch} />
          </>
        )}
      </div>
    </div>
  );
}

function TopBarButton({ onClick, icon, label, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: '5px 10px', background: C.elevated,
        border: `1px solid ${C.border}`, borderRadius: 5,
        color: C.secondary, fontSize: '12px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 4,
        transition: 'all 150ms ease',
      }}
      onMouseEnter={e => e.currentTarget.style.color = C.primary}
      onMouseLeave={e => e.currentTarget.style.color = C.secondary}
    >
      {icon} {label}
    </button>
  );
}
