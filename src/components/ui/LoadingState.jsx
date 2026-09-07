export function LoadingState({ text = 'Loading…' }) {
  return (
    <div className="loading-overlay">
      <div className="spinner" />
      <p className="loading-text">{text}</p>
    </div>
  );
}
