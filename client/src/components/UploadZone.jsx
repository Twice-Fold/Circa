import { useEffect, useRef, useState } from 'react';

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 5;

export default function UploadZone({ onFiles, disabled }) {
  const inputRef = useRef(null);
  const keyRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState([]); // [{ key, file, url }]
  const [localError, setLocalError] = useState(null);

  // Object URLs leak unless revoked; cover unmount and any items dropped from state.
  const urlsRef = useRef(new Set());
  useEffect(() => () => urlsRef.current.forEach((url) => URL.revokeObjectURL(url)), []);

  function addFiles(fileList) {
    setLocalError(null);
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    const skipped = [];
    const additions = [];
    for (const file of files) {
      if (!ACCEPTED.includes(file.type)) {
        skipped.push(`${file.name} isn’t an image (PNG, JPEG, or WebP only)`);
      } else if (file.size > MAX_BYTES) {
        skipped.push(`${file.name} is over 20MB`);
      } else {
        const url = URL.createObjectURL(file);
        urlsRef.current.add(url);
        additions.push({ key: keyRef.current++, file, url });
      }
    }

    setSelected((prev) => {
      const room = MAX_FILES - prev.length;
      if (additions.length > room) {
        setLocalError(`Up to ${MAX_FILES} screenshots — keeping the first ${MAX_FILES}.`);
        additions.slice(room).forEach((a) => {
          URL.revokeObjectURL(a.url);
          urlsRef.current.delete(a.url);
        });
        return [...prev, ...additions.slice(0, Math.max(room, 0))];
      }
      return [...prev, ...additions];
    });

    if (skipped.length > 0) {
      setLocalError(`Couldn’t use ${skipped.join('; ')}.`);
    }
  }

  function removeItem(key) {
    setSelected((prev) => {
      const item = prev.find((s) => s.key === key);
      if (item) {
        URL.revokeObjectURL(item.url);
        urlsRef.current.delete(item.url);
      }
      return prev.filter((s) => s.key !== key);
    });
  }

  function handleSend() {
    if (selected.length === 0) return;
    const files = selected.map((s) => s.file);
    selected.forEach((s) => {
      URL.revokeObjectURL(s.url);
      urlsRef.current.delete(s.url);
    });
    setSelected([]);
    onFiles(files);
  }

  const hasSelection = selected.length > 0;

  return (
    <div>
      <div
        className={`upload-zone${dragging ? ' dragging' : ''}${disabled ? ' disabled' : ''}${hasSelection ? ' compact' : ''}`}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) addFiles(e.dataTransfer.files);
        }}
      >
        <div className="upload-icon">🌙</div>
        <p className="upload-title">
          {hasSelection ? 'Add another view' : 'Drop your sleep screenshots here'}
        </p>
        <p className="upload-sub">
          {hasSelection
            ? 'A stage-breakdown screenshot pairs well with a summary one.'
            : 'Apple Health, Google Fit, Fitbit — any of them. One is enough; add the stage-breakdown view too and Circa combines them. Or click to browse.'}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {localError && <p className="error-text">{localError}</p>}

      {hasSelection && (
        <div className="upload-review">
          <ul className="preview-grid">
            {selected.map((item) => (
              <li key={item.key} className="preview-item">
                <img src={item.url} alt={item.file.name} />
                <button
                  type="button"
                  className="preview-remove"
                  aria-label={`Remove ${item.file.name}`}
                  title={`Remove ${item.file.name}`}
                  onClick={() => removeItem(item.key)}
                >
                  ×
                </button>
                <span className="preview-name">{item.file.name}</span>
              </li>
            ))}
          </ul>
          <div className="actions">
            <button className="btn-primary" onClick={handleSend}>
              Looks good, send {selected.length > 1 ? `${selected.length} screenshots` : 'it'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
