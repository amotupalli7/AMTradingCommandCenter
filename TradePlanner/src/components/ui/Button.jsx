export default function Button({ children, onClick, variant = 'default', className = '', ...props }) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}
