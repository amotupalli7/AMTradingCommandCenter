import React, { useState, useRef, useEffect } from 'react';
import { Plus, X, Trash2 } from 'lucide-react';
import { C, mono, getDirectionColor, getGradeColor } from '../utils/styles.js';
import { GRADES } from '../utils/taxonomy.js';
import { Badge, Pill, PillGroup, Section, ImageSlot, Lightbox } from './ui.jsx';

export default function CardDetailPanel({ card, taxonomy, marketNotes, dispatch, onClose }) {
  const [lightboxSrc, setLightboxSrc] = useState(null);
  const notesRef = useRef(null);

  // Auto-focus the notes textarea when panel opens
  useEffect(() => {
    const t = setTimeout(() => notesRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, []);

  if (!card) return null;

  const update = (patch) => dispatch({ type: 'UPDATE_CARD', id: card.id, patch });

  const isBoth = card.direction === 'both';
  const currentSetup = taxonomy.setups.find(s => s.id === card.setup);
  const currentLongSetup = taxonomy.setups.find(s => s.id === card.longSetup);
  const allSubSetups = taxonomy.setups.flatMap(s => s.subSetups).filter(
    (sub, idx, arr) => arr.findIndex(s => s.id === sub.id) === idx
  );
  const imgs = card.images || { oneMin: null, fiveMin: null, daily: null, additional: [] };

  const handleImageLoad = (slot, src) => {
    if (slot === 'additional') {
      update({ images: { ...imgs, additional: [...(imgs.additional || []), src] } });
    } else {
      update({ images: { ...imgs, [slot]: src } });
    }
  };

  // ─── Side column for "both" cards ──────────────────────────────────────
  const SideColumn = ({ side }) => {
    const isShort = side === 'short';
    const sideColor = isShort ? C.red : C.green;
    const setupKey = isShort ? 'setup' : 'longSetup';
    const subKey = isShort ? 'subSetups' : 'longSubSetups';
    const entryKey = isShort ? 'entryMethods' : 'longEntryMethods';
    const gradeKey = isShort ? 'grade' : 'longGrade';
    const activeSetup = taxonomy.setups.find(s => s.id === card[setupKey]);

    return (
      <div style={{
        flex: 1, padding: '12px', background: C.bg,
        borderRadius: 6, border: `1px solid ${sideColor}33`,
      }}>
        <div style={{
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
          color: sideColor, marginBottom: 12, textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: sideColor }} />
          {side}
        </div>

        <Section title="Grade">
          <PillGroup options={GRADES.map(g => ({ id: g, name: g }))} value={card[gradeKey]}
            onChange={v => update({ [gradeKey]: v })} color={getGradeColor(card[gradeKey])} />
        </Section>

        <div style={{ marginTop: 10 }}>
          <Section title="Setup">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {taxonomy.setups.map(s => (
                <Pill key={s.id} label={s.name} active={card[setupKey] === s.id} color={s.color}
                  onClick={() => update({ [setupKey]: card[setupKey] === s.id ? null : s.id })} small />
              ))}
            </div>
          </Section>
        </div>

        <div style={{ marginTop: 10 }}>
          <Section title="Sub-Setups">
            <PillGroup options={allSubSetups} value={card[subKey] || []}
              onChange={v => update({ [subKey]: v })} multi color={activeSetup?.color || C.blue} small />
          </Section>
        </div>

        <div style={{ marginTop: 10 }}>
          <Section title="Entry Methods">
            <PillGroup options={taxonomy.entryMethods} value={card[entryKey] || []}
              onChange={v => update({ [entryKey]: v })} multi color="#8B5CF6" small />
          </Section>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#000000bb',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9000,
    }} onClick={onClose}>
      <Lightbox
        src={lightboxSrc}
        images={[imgs.oneMin, imgs.fiveMin, imgs.daily, ...(imgs.additional || [])].filter(Boolean)}
        onClose={() => setLightboxSrc(null)}
      />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: isBoth ? 880 : 720, maxHeight: '90vh', background: C.surface,
          border: `1px solid ${C.border}`, borderRadius: 10,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <span style={{ ...mono, fontSize: '22px', fontWeight: 700, color: C.primary, letterSpacing: '0.08em' }}>
            {card.ticker}
          </span>
          <span style={{ ...mono, fontSize: '13px', color: C.dim }}>{card.date}</span>
          <Badge color={getDirectionColor(card.direction)}>{card.direction?.toUpperCase()}</Badge>
          {!isBoth && card.grade && <Badge color={getGradeColor(card.grade)}>{card.grade}</Badge>}
          {(() => {
            const samplePath = imgs.daily || imgs.oneMin || imgs.fiveMin;
            if (!samplePath) return null;
            const fname = decodeURIComponent(samplePath.split('/').pop());
            return (
              <span style={{ ...mono, fontSize: '9px', color: C.dim, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={fname}>
                {fname}
              </span>
            );
          })()}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              onClick={() => { if (confirm('Delete this card?')) { dispatch({ type: 'DELETE_CARD', id: card.id }); onClose(); } }}
              style={{
                padding: '4px 10px', background: C.red + '22',
                border: `1px solid ${C.red}44`, borderRadius: 4,
                color: C.red, fontSize: '11px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <Trash2 size={11} /> Delete
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Section title="Direction">
            <PillGroup
              options={[{ id: 'short', name: 'SHORT' }, { id: 'long', name: 'LONG' }, { id: 'both', name: 'BOTH' }]}
              value={card.direction} onChange={v => update({ direction: v || 'short' })}
              color={getDirectionColor(card.direction)}
            />
          </Section>

          {/* ─── BOTH: side-by-side columns ─── */}
          {isBoth ? (
            <div style={{ display: 'flex', gap: 12 }}>
              <SideColumn side="short" />
              <SideColumn side="long" />
            </div>
          ) : (
            <>
              <Section title="Grade">
                <PillGroup options={GRADES.map(g => ({ id: g, name: g }))} value={card.grade}
                  onChange={v => update({ grade: v })} color={getGradeColor(card.grade)} />
              </Section>

              <Section title="Setup">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {taxonomy.setups.map(s => (
                    <Pill key={s.id} label={s.name} active={card.setup === s.id} color={s.color}
                      onClick={() => update({ setup: card.setup === s.id ? null : s.id })} />
                  ))}
                </div>
              </Section>

              <Section title="Sub-Setups">
                <PillGroup options={allSubSetups} value={card.subSetups || []}
                  onChange={v => update({ subSetups: v })} multi color={currentSetup?.color || C.blue} small />
              </Section>

              <Section title="Entry Methods">
                <PillGroup options={taxonomy.entryMethods} value={card.entryMethods || []}
                  onChange={v => update({ entryMethods: v })} multi color="#8B5CF6" small />
              </Section>
            </>
          )}

          <Section title="Notes">
            <textarea
              ref={notesRef}
              value={card.rawNotes || ''} onChange={e => update({ rawNotes: e.target.value })}
              placeholder="Start typing notes..." rows={3}
              style={{
                width: '100%', background: C.elevated, border: `1px solid ${C.border}`,
                borderRadius: 5, color: C.primary, fontSize: '12px', padding: '8px 10px',
                outline: 'none', resize: 'vertical', lineHeight: 1.5,
                boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />
          </Section>

          <Section title={`Market Conditions — ${card.date}`}>
            <textarea
              value={(marketNotes || {})[card.date] || ''}
              onChange={e => dispatch({ type: 'UPDATE_MARKET_NOTE', date: card.date, note: e.target.value })}
              placeholder="How was the overall market today?" rows={2}
              style={{
                width: '100%', background: C.elevated, border: `1px solid #F59E0B33`,
                borderRadius: 5, color: C.primary, fontSize: '12px', padding: '8px 10px',
                outline: 'none', resize: 'vertical', lineHeight: 1.5,
                boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />
          </Section>

          <Section title="Charts">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <ImageSlot label="1m" src={imgs.oneMin} onLoad={src => handleImageLoad('oneMin', src)} onClick={setLightboxSrc} />
              <ImageSlot label="5m" src={imgs.fiveMin} onLoad={src => handleImageLoad('fiveMin', src)} onClick={setLightboxSrc} />
              <ImageSlot label="Daily" src={imgs.daily} onLoad={src => handleImageLoad('daily', src)} onClick={setLightboxSrc} />
            </div>
            {(imgs.additional || []).length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                {imgs.additional.map((src, idx) => (
                  <ImageSlot key={idx} label={`Extra ${idx + 1}`} src={src} onLoad={() => {}} onClick={setLightboxSrc}
                    onRemove={() => update({ images: { ...imgs, additional: imgs.additional.filter((_, i) => i !== idx) } })} />
                ))}
              </div>
            )}
            <button
              onClick={() => {
                const inp = document.createElement('input');
                inp.type = 'file'; inp.accept = 'image/*';
                inp.onchange = (e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => handleImageLoad('additional', ev.target.result);
                    reader.readAsDataURL(file);
                  }
                };
                inp.click();
              }}
              style={{
                padding: '5px 12px', background: 'transparent',
                border: `1px dashed ${C.borderMid}`, borderRadius: 4,
                color: C.dim, fontSize: '12px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              <Plus size={12} /> Add Image
            </button>
          </Section>
        </div>
      </div>
    </div>
  );
}
