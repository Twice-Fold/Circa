// Client-side Apple Health export parsing. The zip is unpacked and scanned in
// a Web Worker so a big export can't freeze the UI — and the raw file never
// leaves the browser; only the extracted summary goes anywhere.

const MAX_ZIP_BYTES = 250 * 1024 * 1024;

const ERROR_MESSAGES = {
  TOO_LARGE:
    'That export is too big to parse smoothly in your browser. Try a screenshot of last night’s sleep, or chat with Circa Sol and type your times.',
  BAD_ZIP:
    'That file doesn’t look like a valid Apple Health export. In the Health app, tap your profile picture → “Export All Health Data”, then upload the export.zip it creates.',
  NO_EXPORT_XML:
    'That zip doesn’t contain an export.xml, so it may not be an Apple Health export. Try re-exporting from the Health app.',
  NO_SLEEP_RECORDS:
    'No sleep records found in that export. If your iPhone or Watch doesn’t track sleep, try a screenshot from another app — or chat with Circa Sol and type your times.',
};

export function parseHealthExport(file, onProgress) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_ZIP_BYTES) {
      reject(new Error(ERROR_MESSAGES.TOO_LARGE));
      return;
    }

    const worker = new Worker(new URL('../workers/exportParser.worker.js', import.meta.url), {
      type: 'module',
    });
    const finish = (fn, value) => {
      worker.terminate();
      fn(value);
    };

    worker.onmessage = (e) => {
      const { type, label, sleep, code } = e.data;
      if (type === 'progress') onProgress?.(label);
      else if (type === 'done') finish(resolve, sleep);
      else if (type === 'error') finish(reject, new Error(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.BAD_ZIP));
    };
    worker.onerror = () => finish(reject, new Error(ERROR_MESSAGES.BAD_ZIP));

    file
      .arrayBuffer()
      .then((buffer) => worker.postMessage({ buffer }, [buffer]))
      .catch(() => finish(reject, new Error('Could not read that file — try selecting it again.')));
  });
}
