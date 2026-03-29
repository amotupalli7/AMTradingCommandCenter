import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Image, Maximize2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { C, mono } from '../utils/styles.js';

export function Badge({ children, color, style, onClick }) {
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 7px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: 600,
        letterSpacing: '0.03em',
        background: color + '22',
        color: color,
        border: `1px solid ${color}44`,
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Pill({ label, active, color, onClick, small }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: small ? '2px 8px' : '3px 10px',
        borderRadius: '4px',
        fontSize: small ? '11px' : '12px',
        fontWeight: active ? 600 : 400,
        border: `1px solid ${active ? color : C.border}`,
        background: active ? color + '22' : 'transparent',
        color: active ? color : C.secondary,
        cursor: 'pointer',
        transition: 'all 150ms ease',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

export function PillGroup({ options, value, onChange, multi, color, small }) {
  const handleClick = (optId) => {
    if (multi) {
      const arr = Array.isArray(value) ? value : [];
      if (arr.includes(optId)) onChange(arr.filter(x => x !== optId));
      else onChange([...arr, optId]);
    } else {
      onChange(value === optId ? null : optId);
    }
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
      {options.map(opt => {
        const isActive = multi
          ? (Array.isArray(value) && value.includes(opt.id))
          : value === opt.id;
        const c = color || opt.color || C.blue;
        return (
          <Pill
            key={opt.id}
            label={opt.name}
            active={isActive}
            color={c}
            onClick={() => handleClick(opt.id)}
            small={small}
          />
        );
      })}
    </div>
  );
}

export function Section({ title, children }) {
  return (
    <div>
      <div style={{
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.1em',
        color: C.dim,
        textTransform: 'uppercase',
        marginBottom: 6,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export function ImageSlot({ label, src, onLoad, onClick, onRemove }) {
  const fileRef = useRef();
  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => onLoad(ev.target.result);
      reader.readAsDataURL(file);
    }
  };
  const handleFile = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => onLoad(ev.target.result);
      reader.readAsDataURL(file);
    }
  };
  return (
    <div
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
      onClick={() => src ? onClick && onClick(src) : fileRef.current?.click()}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16/9',
        background: C.elevated,
        border: `1px dashed ${C.borderMid}`,
        borderRadius: '6px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        overflow: 'hidden',
        transition: 'border-color 150ms ease',
      }}
    >
      {src ? (
        <>
          <img src={src} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{
            position: 'absolute', top: 4, left: 4,
            background: '#000000aa', borderRadius: 3,
            padding: '1px 5px', fontSize: '10px', color: C.secondary,
          }}>{label}</div>
          <div style={{
            position: 'absolute', top: 4, right: 4,
            background: '#000000aa', borderRadius: 3,
            padding: '2px', cursor: 'pointer', color: C.secondary,
            display: 'flex',
          }} onClick={e => { e.stopPropagation(); onClick && onClick(src); }}>
            <Maximize2 size={12} />
          </div>
          {onRemove && (
            <div style={{
              position: 'absolute', bottom: 4, right: 4,
              background: '#000000cc', borderRadius: 3,
              padding: '2px', cursor: 'pointer', color: C.red,
              display: 'flex',
            }} onClick={e => { e.stopPropagation(); onRemove(); }}>
              <X size={12} />
            </div>
          )}
        </>
      ) : (
        <>
          <Image size={18} color={C.dim} />
          <span style={{ marginTop: 4, fontSize: '11px', color: C.dim }}>{label}</span>
          <span style={{ fontSize: '10px', color: C.dim, opacity: 0.7 }}>Drop or click</span>
        </>
      )}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
    </div>
  );
}

export function Lightbox({ src, images, onClose }) {
  // Only show when src is set (user clicked an image)
  const allImgs = src ? ((images && images.length > 0) ? images : [src]) : [];
  const [idx, setIdx] = useState(0);

  // Sync index when src changes (user clicked a different chart)
  useEffect(() => {
    if (!src) { setIdx(0); return; }
    if (allImgs.length <= 1) { setIdx(0); return; }
    const i = allImgs.indexOf(src);
    if (i >= 0) setIdx(i);
  }, [src]);

  const goPrev = useCallback(() => setIdx(i => Math.max(0, i - 1)), []);
  const goNext = useCallback(() => setIdx(i => Math.min(allImgs.length - 1, i + 1)), [allImgs.length]);

  useEffect(() => {
    if (!src) return;
    const handler = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); goPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); goNext(); }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [onClose, goPrev, goNext, allImgs.length]);

  if (allImgs.length === 0) return null;

  const currentSrc = allImgs[idx] || allImgs[0];
  const multi = allImgs.length > 1;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: '#000000ee',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      {/* Prev */}
      {multi && (
        <button
          onClick={e => { e.stopPropagation(); goPrev(); }}
          style={{
            position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
            background: C.elevated, border: `1px solid ${C.border}`, borderRadius: '50%',
            width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: idx === 0 ? 'not-allowed' : 'pointer',
            color: idx === 0 ? C.dim : C.primary, opacity: idx === 0 ? 0.4 : 1,
            zIndex: 10000,
          }}
        >
          <ChevronLeft size={20} />
        </button>
      )}

      <img
        src={currentSrc}
        alt="lightbox"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 6, cursor: 'default' }}
      />

      {/* Next */}
      {multi && (
        <button
          onClick={e => { e.stopPropagation(); goNext(); }}
          style={{
            position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
            background: C.elevated, border: `1px solid ${C.border}`, borderRadius: '50%',
            width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: idx === allImgs.length - 1 ? 'not-allowed' : 'pointer',
            color: idx === allImgs.length - 1 ? C.dim : C.primary, opacity: idx === allImgs.length - 1 ? 0.4 : 1,
            zIndex: 10000,
          }}
        >
          <ChevronRight size={20} />
        </button>
      )}

      {/* Counter + close */}
      <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 8, zIndex: 10000 }}>
        {multi && (
          <span style={{ ...mono, fontSize: '13px', color: C.secondary, background: '#000000aa', padding: '4px 10px', borderRadius: 4 }}>
            {idx + 1} / {allImgs.length}
          </span>
        )}
        <button
          onClick={onClose}
          style={{
            background: C.elevated, border: `1px solid ${C.border}`,
            borderRadius: '50%', width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: C.primary,
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
