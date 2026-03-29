import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Plus, Check, X, Pencil, Trash2, Layers, ArrowUpDown } from 'lucide-react';
import { C, mono } from '../utils/styles.js';
import { SETUP_COLORS } from '../utils/taxonomy.js';

export default function TaxonomySidebar({ taxonomy, cards, dispatch }) {
  const [addingSetup, setAddingSetup] = useState(false);
  const [newSetupName, setNewSetupName] = useState('');
  const [addingSub, setAddingSub] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [addingEntry, setAddingEntry] = useState(false);
  const [newEntryName, setNewEntryName] = useState('');

  const globalSubSetups = useMemo(() => {
    return taxonomy.setups.flatMap(s => s.subSetups).filter(
      (sub, idx, arr) => arr.findIndex(s => s.id === sub.id) === idx
    );
  }, [taxonomy]);

  const addSetup = () => {
    if (!newSetupName.trim()) return;
    const id = newSetupName.toLowerCase().replace(/\s+/g, '-');
    dispatch({
      type: 'ADD_SETUP',
      setup: {
        id, name: newSetupName.trim(), fullName: newSetupName.trim(),
        color: SETUP_COLORS[taxonomy.setups.length % SETUP_COLORS.length],
        side: 'short',
        subSetups: [...globalSubSetups],
      },
    });
    setNewSetupName(''); setAddingSetup(false);
  };

  const addSubSetup = () => {
    if (!newSubName.trim()) return;
    const id = newSubName.toLowerCase().replace(/\s+/g, '-');
    dispatch({ type: 'ADD_SUBSETTUP_GLOBAL', setupId: taxonomy.setups[0]?.id, subSetup: { id, name: newSubName.trim() } });
    setNewSubName(''); setAddingSub(false);
  };

  const addEntry = () => {
    if (!newEntryName.trim()) return;
    const id = newEntryName.toLowerCase().replace(/\s+/g, '-');
    dispatch({ type: 'ADD_ENTRY_METHOD', method: { id, name: newEntryName.trim() } });
    setNewEntryName(''); setAddingEntry(false);
  };

  return (
    <div style={{
      width: 250, minWidth: 250, background: C.surface,
      borderLeft: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 12px 8px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: C.secondary }}>TAXONOMY</span>
        <Layers size={13} color={C.dim} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {/* ─── Setups grouped by Side ─── */}
        <SidebarSection title="SETUPS" defaultOpen>
          {['short', 'long'].map(side => {
            const sideSetups = taxonomy.setups.filter(s => (s.side || 'short') === side);
            const sideCount = cards.filter(c => sideSetups.some(s => s.id === c.setup)).length;
            const sideColor = side === 'short' ? C.red : C.green;
            return (
              <div key={side}>
                <div style={{
                  padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{
                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
                    color: sideColor, textTransform: 'uppercase',
                  }}>
                    {side}
                  </span>
                  <span style={{ fontSize: '10px', color: C.dim, ...mono }}>{sideCount}</span>
                </div>
                {sideSetups.map(setup => {
                  const count = cards.filter(c => c.setup === setup.id).length;
                  return (
                    <EditableItem
                      key={setup.id}
                      name={setup.name}
                      count={count}
                      dotColor={setup.color}
                      onRename={(name) => dispatch({ type: 'RENAME_SETUP', id: setup.id, name })}
                      onDelete={() => dispatch({ type: 'DELETE_SETUP', id: setup.id })}
                      onToggleSide={() => dispatch({ type: 'UPDATE_SETUP_SIDE', id: setup.id, side: side === 'short' ? 'long' : 'short' })}
                    />
                  );
                })}
              </div>
            );
          })}
          <InlineAdd
            active={addingSetup}
            value={newSetupName}
            onChange={setNewSetupName}
            onSubmit={addSetup}
            onCancel={() => { setAddingSetup(false); setNewSetupName(''); }}
            onStart={() => setAddingSetup(true)}
            placeholder="Setup name"
            label="Add Setup"
          />
        </SidebarSection>

        {/* ─── Sub-Setups grouped by Side ─── */}
        <SidebarSection title="SUB-SETUPS" defaultOpen>
          {['short', 'long'].map(side => {
            const sideSubs = globalSubSetups.filter(s => (s.side || 'short') === side);
            const sideColor = side === 'short' ? C.red : C.green;
            return (
              <div key={side}>
                <div style={{ padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', color: sideColor, textTransform: 'uppercase' }}>
                    {side}
                  </span>
                </div>
                {sideSubs.map(sub => {
                  const count = cards.filter(c => c.subSetups?.includes(sub.id)).length;
                  return (
                    <EditableItem
                      key={sub.id}
                      name={sub.name}
                      count={count}
                      onRename={(name) => dispatch({ type: 'RENAME_SUBSETUP', id: sub.id, name })}
                      onDelete={() => dispatch({ type: 'DELETE_SUBSETUP', id: sub.id })}
                      onToggleSide={() => dispatch({ type: 'UPDATE_SUBSETUP_SIDE', id: sub.id, side: side === 'short' ? 'long' : 'short' })}
                      small
                    />
                  );
                })}
              </div>
            );
          })}
          <InlineAdd
            active={addingSub}
            value={newSubName}
            onChange={setNewSubName}
            onSubmit={addSubSetup}
            onCancel={() => { setAddingSub(false); setNewSubName(''); }}
            onStart={() => setAddingSub(true)}
            placeholder="Sub-setup name"
            label="Add Sub-Setup"
            small
          />
        </SidebarSection>

        {/* ─── Entry Methods grouped by Side ─── */}
        <SidebarSection title="ENTRY METHODS" defaultOpen>
          {['short', 'long'].map(side => {
            const sideMethods = taxonomy.entryMethods.filter(e => (e.side || 'short') === side);
            const sideColor = side === 'short' ? C.red : C.green;
            return (
              <div key={side}>
                <div style={{ padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', color: sideColor, textTransform: 'uppercase' }}>
                    {side}
                  </span>
                </div>
                {sideMethods.map(em => {
                  const count = cards.filter(c => c.entryMethods?.includes(em.id)).length;
                  return (
                    <EditableItem
                      key={em.id}
                      name={em.name}
                      count={count}
                      onRename={(name) => dispatch({ type: 'RENAME_ENTRY_METHOD', id: em.id, name })}
                      onDelete={() => dispatch({ type: 'DELETE_ENTRY_METHOD', id: em.id })}
                      onToggleSide={() => dispatch({ type: 'UPDATE_ENTRY_METHOD_SIDE', id: em.id, side: side === 'short' ? 'long' : 'short' })}
                      small
                    />
                  );
                })}
              </div>
            );
          })}
          <InlineAdd
            active={addingEntry}
            value={newEntryName}
            onChange={setNewEntryName}
            onSubmit={addEntry}
            onCancel={() => { setAddingEntry(false); setNewEntryName(''); }}
            onStart={() => setAddingEntry(true)}
            placeholder="Method name"
            label="Add Method"
            small
          />
        </SidebarSection>
      </div>
    </div>
  );
}

// ─── EDITABLE ITEM (hover to show rename/delete) ──────────────────────────
function EditableItem({ name, count, dotColor, onRename, onDelete, onToggleSide, small }) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);

  const submitRename = () => {
    if (editValue.trim() && editValue.trim() !== name) {
      onRename(editValue.trim());
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div style={{ padding: small ? '3px 12px' : '5px 12px', display: 'flex', gap: 4, alignItems: 'center' }}>
        {dotColor && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />}
        <input
          autoFocus
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setEditing(false); }}
          onBlur={submitRename}
          style={{
            flex: 1, background: C.elevated, border: `1px solid ${C.blue}`,
            borderRadius: 3, color: C.primary,
            fontSize: small ? '11px' : '12px', padding: small ? '2px 6px' : '3px 8px',
            outline: 'none',
          }}
        />
        <button onClick={submitRename} style={{ background: 'none', border: 'none', color: C.green, cursor: 'pointer', padding: 0 }}>
          <Check size={small ? 11 : 13} />
        </button>
      </div>
    );
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: small ? '3px 12px' : '5px 12px',
        display: 'flex', alignItems: 'center', gap: 6,
        transition: 'background 100ms ease',
        background: hovered ? C.elevated : 'transparent',
      }}
    >
      {dotColor && <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />}
      <span style={{
        fontSize: small ? '11px' : '12px',
        fontWeight: small ? 400 : 600,
        color: small ? C.secondary : C.primary,
        flex: 1,
      }}>
        {name}
      </span>
      {hovered && (
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {onToggleSide && (
            <button
              onClick={onToggleSide}
              title="Move to other side (Long/Short)"
              style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', padding: '2px', display: 'flex' }}
            >
              <ArrowUpDown size={10} />
            </button>
          )}
          <button
            onClick={() => { setEditValue(name); setEditing(true); }}
            title="Rename"
            style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', padding: '2px', display: 'flex' }}
          >
            <Pencil size={10} />
          </button>
          <button
            onClick={() => { if (confirm(`Delete "${name}"?`)) onDelete(); }}
            title="Delete"
            style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', padding: '2px', display: 'flex' }}
          >
            <Trash2 size={10} />
          </button>
        </div>
      )}
      {!hovered && count > 0 && <span style={{ fontSize: '11px', color: C.dim, ...mono }}>{count}</span>}
    </div>
  );
}

// ─── INLINE ADD ───────────────────────────────────────────────────────────
function InlineAdd({ active, value, onChange, onSubmit, onCancel, onStart, placeholder, label, small }) {
  if (active) {
    return (
      <div style={{ padding: small ? '3px 12px' : '4px 12px', display: 'flex', gap: 4 }}>
        <input
          autoFocus
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onSubmit(); if (e.key === 'Escape') onCancel(); }}
          placeholder={placeholder}
          style={{
            flex: 1, background: C.elevated, border: `1px solid ${C.border}`,
            borderRadius: 3, color: C.primary,
            fontSize: small ? '11px' : '12px', padding: small ? '3px 6px' : '4px 8px',
            outline: 'none',
          }}
        />
        <button onClick={onSubmit} style={{ background: 'none', border: 'none', color: C.green, cursor: 'pointer', padding: 0 }}>
          <Check size={small ? 12 : 13} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={onStart}
      style={{
        padding: small ? '3px 12px' : '4px 12px',
        background: 'none', border: 'none', color: C.dim,
        fontSize: small ? '11px' : '11px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 4,
        width: '100%', textAlign: 'left',
      }}
    >
      <Plus size={small ? 10 : 11} /> {label}
    </button>
  );
}

// ─── COLLAPSIBLE SECTION ──────────────────────────────────────────────────
function SidebarSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: `1px solid ${C.border}`, paddingBottom: 4 }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6,
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        {open ? <ChevronDown size={11} color={C.dim} /> : <ChevronRight size={11} color={C.dim} />}
        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: C.dim }}>{title}</span>
      </div>
      {open && <div style={{ paddingBottom: 4 }}>{children}</div>}
    </div>
  );
}
