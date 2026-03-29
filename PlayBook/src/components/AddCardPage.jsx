import React, { useState } from 'react';
import { Plus, Check, PlusCircle } from 'lucide-react';
import { C, mono, getDirectionColor, getGradeColor } from '../utils/styles.js';
import { GRADES } from '../utils/taxonomy.js';
import { genId } from '../utils/helpers.js';
import { Section, Pill, PillGroup, ImageSlot, Lightbox } from './ui.jsx';

export default function AddCardPage({ taxonomy, dispatch }) {
  const [ticker, setTicker] = useState('');
  const [date, setDate] = useState('');
  const [direction, setDirection] = useState('short');
  const [setup, setSetup] = useState(null);
  const [subSetups, setSubSetups] = useState([]);
  const [entryMethods, setEntryMethods] = useState([]);
  const [grade, setGrade] = useState(null);
  const [notes, setNotes] = useState('');
  const [images, setImages] = useState({ oneMin: null, fiveMin: null, daily: null, additional: [] });
  const [lightboxSrc, setLightboxSrc] = useState(null);

  const allSubSetups = taxonomy.setups.flatMap(s => s.subSetups).filter(
    (sub, idx, arr) => arr.findIndex(s => s.id === sub.id) === idx
  );
  const currentSetup = taxonomy.setups.find(s => s.id === setup);

  const handleImageLoad = (slot, src) => {
    if (slot === 'additional') {
      setImages(prev => ({ ...prev, additional: [...prev.additional, src] }));
    } else {
      setImages(prev => ({ ...prev, [slot]: src }));
    }
  };

  const handleSubmit = () => {
    if (!ticker.trim()) return;
    dispatch({
      type: 'ADD_CARD',
      card: {
        id: genId(),
        ticker: ticker.toUpperCase().trim(),
        date: date || new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }),
        direction,
        rawNotes: notes,
        grade,
        setup,
        subSetups,
        entryMethods,
        images,
        notes: '',
      },
    });
    setTicker(''); setDate(''); setDirection('short'); setSetup(null);
    setSubSetups([]); setEntryMethods([]); setGrade(null); setNotes('');
    setImages({ oneMin: null, fiveMin: null, daily: null, additional: [] });
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: C.bg }}>
      <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div style={{
          fontSize: '18px', fontWeight: 700, color: C.primary, marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <PlusCircle size={20} color={C.green} />
          Add Setup Card
        </div>

        <div style={{
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '24px', display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          {/* Ticker & Date */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Section title="Ticker">
                <input
                  value={ticker}
                  onChange={e => setTicker(e.target.value.toUpperCase())}
                  placeholder="e.g. LGVN"
                  autoFocus
                  style={{
                    width: '100%', padding: '8px 12px',
                    background: C.elevated, border: `1px solid ${C.border}`,
                    borderRadius: 5, color: C.primary, fontSize: '16px',
                    outline: 'none', ...mono, letterSpacing: '0.08em', fontWeight: 700,
                  }}
                />
              </Section>
            </div>
            <div style={{ width: 160 }}>
              <Section title="Date">
                <input
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  placeholder="e.g. 3/10/26"
                  style={{
                    width: '100%', padding: '8px 12px',
                    background: C.elevated, border: `1px solid ${C.border}`,
                    borderRadius: 5, color: C.primary, fontSize: '14px',
                    outline: 'none', ...mono,
                  }}
                />
              </Section>
            </div>
          </div>

          <Section title="Direction">
            <PillGroup
              options={[{ id: 'short', name: 'SHORT' }, { id: 'long', name: 'LONG' }, { id: 'both', name: 'BOTH' }]}
              value={direction}
              onChange={v => setDirection(v || 'short')}
              color={getDirectionColor(direction)}
            />
          </Section>

          <Section title="Setup">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {taxonomy.setups.map(s => (
                <Pill key={s.id} label={s.name} active={setup === s.id} color={s.color}
                  onClick={() => setSetup(setup === s.id ? null : s.id)} />
              ))}
            </div>
          </Section>

          <Section title="Sub-Setups">
            <PillGroup options={allSubSetups} value={subSetups} onChange={setSubSetups}
              multi color={currentSetup?.color || C.blue} small />
          </Section>

          <Section title="Entry Methods">
            <PillGroup options={taxonomy.entryMethods} value={entryMethods} onChange={setEntryMethods}
              multi color="#8B5CF6" small />
          </Section>

          <Section title="Grade">
            <PillGroup options={GRADES.map(g => ({ id: g, name: g }))} value={grade}
              onChange={setGrade} color={getGradeColor(grade)} />
          </Section>

          <Section title="Notes">
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Setup notes, observations, key levels..."
              rows={3}
              style={{
                width: '100%', background: C.elevated, border: `1px solid ${C.border}`,
                borderRadius: 5, color: C.primary, fontSize: '12px', padding: '8px 10px',
                outline: 'none', resize: 'vertical', lineHeight: 1.5,
                boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />
          </Section>

          <Section title="Charts">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <ImageSlot label="1m" src={images.oneMin} onLoad={src => handleImageLoad('oneMin', src)} onClick={setLightboxSrc} />
              <ImageSlot label="5m" src={images.fiveMin} onLoad={src => handleImageLoad('fiveMin', src)} onClick={setLightboxSrc} />
              <ImageSlot label="Daily" src={images.daily} onLoad={src => handleImageLoad('daily', src)} onClick={setLightboxSrc} />
            </div>
            {images.additional.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                {images.additional.map((src, idx) => (
                  <ImageSlot key={idx} label={`Extra ${idx + 1}`} src={src} onLoad={() => {}} onClick={setLightboxSrc}
                    onRemove={() => setImages(prev => ({ ...prev, additional: prev.additional.filter((_, i) => i !== idx) }))} />
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

          <button
            onClick={handleSubmit}
            disabled={!ticker.trim()}
            style={{
              padding: '10px 20px',
              background: ticker.trim() ? C.green + '22' : C.elevated,
              border: `1px solid ${ticker.trim() ? C.green : C.border}`,
              borderRadius: 6,
              color: ticker.trim() ? C.green : C.dim,
              fontSize: '14px', fontWeight: 700,
              cursor: ticker.trim() ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 150ms ease',
            }}
          >
            <Check size={16} /> Add to PlayBook
          </button>
        </div>
      </div>
    </div>
  );
}
