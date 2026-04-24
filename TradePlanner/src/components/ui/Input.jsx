export default function Input({ label, value, onChange, placeholder, className = '', mono = false, large = false, ...props }) {
  return (
    <div className={`field ${className}`}>
      {label && <label className="field-label">{label}</label>}
      <input
        className={`field-input${mono ? ' mono' : ''}${large ? ' large' : ''}`}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        {...props}
      />
    </div>
  );
}
