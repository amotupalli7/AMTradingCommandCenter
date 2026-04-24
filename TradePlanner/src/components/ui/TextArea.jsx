export default function TextArea({ label, value, onChange, placeholder, rows = 3, className = '', highlight = false }) {
  return (
    <div className={`field ${className}`}>
      {label && <label className="field-label">{label}</label>}
      <textarea
        className={`field-textarea${highlight ? ' highlight' : ''}`}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
    </div>
  );
}
