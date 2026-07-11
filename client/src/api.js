async function post(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the Circa server — is it running on port 3001?');
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    // fall through to the generic error below
  }
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

export async function parseScreenshot(dataUrl) {
  const { sleep } = await post('/api/parse', { image: dataUrl });
  return sleep;
}

export async function generateSchedule(sleep) {
  const { schedule } = await post('/api/schedule', { sleep });
  return schedule;
}
