export default function Badge({ children, active, onClick, className = '' }) {
  return (
    <button
      type="button"
      className={`badge${active ? ' active' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
