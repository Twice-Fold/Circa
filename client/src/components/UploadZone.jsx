import { useRef, useState } from 'react';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 20 * 1024 * 1024;

export default function UploadZone({ onFile, disabled }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState(null);

  function handleFile(file) {
    setLocalError(null);
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setLocalError('That doesn’t look like an image — upload a PNG, JPEG, or WebP screenshot.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError('Screenshot is over 20MB — try a smaller one.');
      return;
    }
    onFile(file);
  }

  return (
    <div>
      <div
        className={`upload-zone${dragging ? ' dragging' : ''}${disabled ? ' disabled' : ''}`}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) handleFile(e.dataTransfer.files?.[0]);
        }}
      >
        <div className="upload-icon">🌙</div>
        <p className="upload-title">Drop your sleep screenshot here</p>
        <p className="upload-sub">Apple Health, Google Fit, Fitbit — any of them. Or click to browse.</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          hidden
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {localError && <p className="error-text">{localError}</p>}
    </div>
  );
}
