import JSZip from 'jszip';
import { extractSleepFromExportXml } from '../lib/appleHealth.js';

// Uncompressed export.xml beyond this risks exhausting tab memory; better to
// refuse cleanly than to freeze or crash mid-parse.
const MAX_XML_BYTES = 400 * 1024 * 1024;

const progress = (label) => self.postMessage({ type: 'progress', label });

self.onmessage = async (e) => {
  try {
    progress('Unpacking your export…');
    let zip;
    try {
      zip = await JSZip.loadAsync(e.data.buffer);
    } catch {
      throw new Error('BAD_ZIP');
    }

    const entry = Object.values(zip.files).find(
      (f) => !f.dir && /(^|\/)export\.xml$/i.test(f.name) && !f.name.startsWith('__MACOSX')
    );
    if (!entry) throw new Error('NO_EXPORT_XML');

    // JSZip keeps the uncompressed size in internal data; guard when readable.
    const xmlBytes = entry._data?.uncompressedSize;
    if (typeof xmlBytes === 'number' && xmlBytes > MAX_XML_BYTES) throw new Error('TOO_LARGE');

    progress('Reading export.xml…');
    const xml = await entry.async('string');

    progress('Scanning your sleep records…');
    const sleep = extractSleepFromExportXml(xml);
    self.postMessage({ type: 'done', sleep });
  } catch (err) {
    self.postMessage({ type: 'error', code: err.message });
  }
};
