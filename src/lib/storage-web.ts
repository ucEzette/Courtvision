/**
 * Cloudflare R2 Storage Implementation
 * Handles presigned URLs for uploading and downloading videos
 */

export interface StorageMetadata {
  key: string;
  url: string;
}

const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks for better stability
const MAX_CONCURRENT = 3;
const MAX_RETRIES = 3;
const PART_TIMEOUT = 300000; // 5 minute timeout per part for slow connections

interface UploadSession {
  key: string;
  uploadId: string;
  parts: { ETag: string; PartNumber: number }[];
  fileName: string;
  fileSize: number;
  lastUpdated: number;
}

const getSessionKey = (file: File) => `courtvision_upload_${file.name}_${file.size}`;

function saveSession(file: File, session: UploadSession) {
  try {
    localStorage.setItem(getSessionKey(file), JSON.stringify({ ...session, lastUpdated: Date.now() }));
  } catch (e) { console.warn('Failed to save upload session:', e); }
}

function getSession(file: File): UploadSession | null {
  try {
    const data = localStorage.getItem(getSessionKey(file));
    if (!data) return null;
    const session = JSON.parse(data) as UploadSession;
    // Session is valid for 24 hours
    if (Date.now() - session.lastUpdated > 24 * 60 * 60 * 1000) {
      localStorage.removeItem(getSessionKey(file));
      return null;
    }
    return session;
  } catch (e) { return null; }
}

function clearSession(file: File) {
  localStorage.removeItem(getSessionKey(file));
}

export async function getDownloadUrl(key: string): Promise<string> {
  const response = await fetch(`/api/storage?key=${encodeURIComponent(key)}`);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get download URL: ${error}`);
  }
  const { url } = await response.json() as { url: string };
  return url;
}

export async function uploadFile(file: File, onProgress?: (p: number) => void): Promise<string> {
  const contentType = file.type || 'video/mp4';

  // Small files: Standard Upload
  if (file.size <= CHUNK_SIZE) {
    const response = await fetch('/api/storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', fileName: file.name, contentType }),
    });
    const { key, url } = await response.json() as { key: string; url: string };
    
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', contentType);
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }
      xhr.onload = () => xhr.status === 200 ? resolve(null) : reject(new Error(`Single part upload failed (HTTP ${xhr.status})`));
      xhr.onerror = () => reject(new Error('Network error during single part upload'));
      xhr.timeout = PART_TIMEOUT;
      xhr.send(file);
    });
    return key;
  }

  // Large files: Resumable Multipart Upload
  let session = getSession(file);
  let key = session?.key || '';
  let uploadId = session?.uploadId || '';
  const parts = session?.parts || [];

  if (!uploadId) {
    if (!file.name) throw new Error('File name is missing');

    // 1. Initialize new session
    const initRes = await fetch('/api/storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'multipart-init', fileName: file.name, contentType }),
    });

    const initData = await initRes.json().catch(() => ({ error: 'Invalid JSON from worker' })) as any;

    if (!initRes.ok) {
       throw new Error(`R2 Initialization Failed: ${initData.error || initRes.statusText}`);
    }

    key = initData.key;
    uploadId = initData.uploadId;
    
    session = { key, uploadId, parts: [], fileName: file.name, fileSize: file.size, lastUpdated: Date.now() };
    saveSession(file, session);
  } else {
    console.log(`Resuming upload for ${file.name} (uploadId: ${uploadId}) - ${parts.length} parts done`);
  }

  const totalParts = Math.ceil(file.size / CHUNK_SIZE);
  const partProgress = new Array(totalParts).fill(0);
  
  // Track already completed parts
  parts.forEach(p => {
    partProgress[p.PartNumber - 1] = Math.min(CHUNK_SIZE, file.size - (p.PartNumber - 1) * CHUNK_SIZE);
  });

  const updateOverallProgress = () => {
    if (!onProgress) return;
    const totalUploaded = partProgress.reduce((a, b) => a + b, 0);
    onProgress(Math.round((totalUploaded / file.size) * 100));
  };

  updateOverallProgress(); // Show initial resume progress

  // 2. Upload Remaining Parts
  const completedPartNumbers = new Set(parts.map(p => p.PartNumber));
  const queue = Array.from({ length: totalParts }, (_, i) => i + 1).filter(pNum => !completedPartNumbers.has(pNum));

  const workers = Array.from({ length: MAX_CONCURRENT }, async () => {
    while (queue.length > 0) {
      const partNumber = queue.shift()!;
      const start = (partNumber - 1) * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      let etag = '';
      let success = false;
      let lastError = null;

      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const partRes = await fetch('/api/storage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'multipart-part', key, uploadId, partNumber }),
          });

          if (!partRes.ok) {
             const errorData = await partRes.json().catch(() => ({ error: 'Part init failed' })) as any;
             const msg = errorData.error || partRes.statusText;
             // Recover if session is dead
             if (msg.toLowerCase().includes('does not exist') || partRes.status === 404) {
                clearSession(file);
                throw new Error("Upload session expired. Please refresh and try again to restart from scratch.");
             }
             throw new Error(msg);
          }

          const { url } = await partRes.json() as { url: string };

          const etagRaw = await new Promise<string>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', url);
            xhr.setRequestHeader('Content-Type', contentType);
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                partProgress[partNumber - 1] = e.loaded;
                updateOverallProgress();
              }
            };
            xhr.onload = () => {
              if (xhr.status === 200) {
                resolve(xhr.getResponseHeader('ETag') || '');
              } else {
                reject(new Error(`HTTP ${xhr.status}`));
              }
            };
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.timeout = PART_TIMEOUT;
            xhr.send(chunk);
          });

          etag = etagRaw.replace(/"/g, '');
          success = true;
          break; // Success!
        } catch (err: any) {
          console.warn(`Part ${partNumber} attempt ${attempt} failed:`, err.message);
          lastError = err;
          // Don't retry if we explicitly decided to wipe the session
          if (err.message.includes("expired")) throw err;
          if (attempt < MAX_RETRIES) {
             await new Promise(r => setTimeout(r, 1000 * attempt));
          }
        }
      }

      if (!success) {
        throw new Error(`Part ${partNumber} failed after ${MAX_RETRIES} attempts: ${lastError?.message}`);
      }

      parts.push({ ETag: etag, PartNumber: partNumber });
      saveSession(file, { ...session!, parts }); // Save progress after each chunk
    }
  });

  await Promise.all(workers);

  // 3. Complete
  const completeRes = await fetch('/api/storage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      action: 'multipart-complete', 
      key, 
      uploadId, 
      parts: parts.sort((a, b) => a.PartNumber - b.PartNumber) 
    }),
  });

  if (!completeRes.ok) {
    const errorBody = (await completeRes.json().catch(() => ({}))) as any;
    const msg = errorBody.error || completeRes.statusText;
    // Recover if session is dead at completion
    if (msg.toLowerCase().includes('does not exist') || completeRes.status === 404) {
       clearSession(file);
       throw new Error("Upload finalization failed because the session expired. Please refresh and try again to restart from scratch.");
    }
    throw new Error(`Completion failed: ${msg}`);
  }
  
  clearSession(file); // Final success - wipe persistence
  return key;
}

export async function deleteFile(key: string): Promise<void> {
  const response = await fetch(`/api/storage?key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to delete file: ${error}`);
  }
}
