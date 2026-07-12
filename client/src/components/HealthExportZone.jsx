import { useRef, useState } from 'react';

const ACCEPTED_EXTENSION = /\.zip$/i;

export default function HealthExportZone({ onFile, disabled }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState(null);

  function handleFile(file) {
    setLocalError(null);
    if (!file) return;
    if (!ACCEPTED_EXTENSION.test(file.name)) {
      setLocalError('That’s not a .zip — upload the export.zip the Health app creates.');
      return;
    }
    onFile(file);
  }

  return (
    <div>
      <div
        className={`export-zone${dragging ? ' dragging' : ''}${disabled ? ' disabled' : ''}`}
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
        <span className="export-icon" aria-hidden="true">🍎</span>
        <div className="export-body">
          <p className="upload-title">Import your Apple Health export</p>
          <p className="upload-sub">
            Health app → profile picture → “Export All Health Data” → drop the <code>export.zip</code>{' '}
            here. Unpacked and read on your device — the file never leaves your browser.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
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
