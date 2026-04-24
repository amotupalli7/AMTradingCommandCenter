export default function Select({ label, value, onChange, options, placeholder = 'Select...', className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label && <label className="field-label">{label}</label>}
      <select
        className="field-select"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}
