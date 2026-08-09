// src/api/customer_api.js
import { getData, postData } from './api';

const API_BASE =
    process.env.REACT_APP_API_BASE       // .env: REACT_APP_API_BASE=http://localhost:8080
    || (typeof window !== 'undefined' && window.__API_BASE__) // opsiyonel global
    || 'http://localhost:8080';          // fallback


// helper: dataURL -> sadece base64
function dataURLtoBase64(dataUrl = '') {
  const parts = String(dataUrl).split(',');
  return parts.length > 1 ? parts[1] : '';
}

// helper: dataURL -> mime
function dataURLMime(dataUrl = '') {
  const m = String(dataUrl).match(/^data:(.*?);base64,/);
  return m?.[1] || 'image/png';
}

/** Token'ı daima stringe indir (JSON saklanmış olabilir, "Bearer " öneki olabilir) */
function getTokenString() {
  const raw = localStorage.getItem('API_TOKEN');
  if (!raw) {
    // dev fallback — insecure placeholder; must match the backend's JWT_SECRET
    return process.env.REACT_APP_API_TOKEN || 'dev-insecure-shared-secret-change-me';
  }
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      const val = obj.token || obj.access_token || obj.jwt || obj.value || null;
      if (val) return String(val);
    }
  } catch {
    // raw plain string
  }
  const s = String(raw);
  return s.startsWith('Bearer ') ? s.slice(7) : s;
}

// Blob -> File (Safari fallback'lı)
function blobToFile(blob, filename) {
  try {
    return new File([blob], filename, { type: blob?.type || 'application/octet-stream' });
  } catch {
    const f = blob;
    f.name = filename;
    f.lastModified = Date.now();
    return f;
  }
}

// (Gerekirse kullanırsın)
function dataURLtoBlob(dataUrl) {
  const [meta, b64] = String(dataUrl).split(',');
  const mime = (meta && meta.match(/data:(.*?);base64/))?.[1] || 'image/jpeg';
  const bin = atob(b64 || '');
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export const useCustomerApi = () => {
  // getData/postData bu 'meeting' üstüne /api/ prefix'ini zaten ekliyorsa
  const BASE = 'meeting';
  const token = getTokenString();

  // GET /api/meeting/pending  (no auth)
  const getPendingMeetings = async () => {
    try {
      const res = await getData(`${BASE}/pending`);
      if (Array.isArray(res)) return res;
      if (res && Array.isArray(res.data)) return res.data;
      return [];
    } catch (err) {
      console.error('Pending list error:', err);
      return [];
    }
  };

  // GET /api/meeting/:id
  const getMeeting = async (id) => {
    try {
      if (!id) throw new Error('Missing meeting id');
      const res = await getData(`${BASE}/${id}`);
      return res || null;
    } catch (err) {
      console.error('Get meeting error:', err);
      return null;
    }
  };

  // POST /api/meeting/start
  const startMeeting = async (params) => {
    try {
      return await postData(`${BASE}/start`, params, token);
    } catch (err) {
      console.error('Start meeting error:', err);
      throw err;
    }
  };

  // (optional) POST /api/meeting/:id/join
  const joinMeeting = async (id, userId) => {
    try {
      return await postData(`${BASE}/${id}/join`, { userId: String(userId) }, token);
    } catch (err) {
      console.error('Join meeting error:', err);
      throw err;
    }
  };

  // GET /api/meeting/:id/status
  const getMeetingStatus = async (id) => {
    try {
      return await getData(`${BASE}/${id}/status`, token);
    } catch (err) {
      console.error('Get status error:', err);
      throw err;
    }
  };

  // POST /api/meeting/:id/end (JSON) — yalnızca { by, notes, video }
  const endMeeting = async (id, { by, notes, video } = {}) => {
    const url = `${BASE}/${id}/end`;
    const payload = { by, notes, video };

    // boşları çıkar
    Object.keys(payload).forEach((k) => {
      const v = payload[k];
      if (v === undefined || v === null) delete payload[k];
    });

    const res = await postData(url, payload, token);
    return res?.data || res || null;
  };

  // POST /api/meeting/:id/screenshots/base64 (JSON: { dataBase64, contentType, takenBy, note })
  const uploadScreenshot = async (
      meetingId,
      dataUrl,
      { takenBy = 'operator-frontend', note = '' } = {}
  ) => {
    if (!meetingId || !dataUrl) throw new Error('missing args');
    const url = `${BASE}/${encodeURIComponent(meetingId)}/screenshots/base64`;
    const payload = {
      dataBase64: dataURLtoBase64(dataUrl), // Sadece base64 (prefix yok)
      contentType: dataURLMime(dataUrl),    // örn: image/png
      takenBy,
      note
    };
    const res = await postData(url, payload, token);
    return res?.data || res || null;
  };

  /** Multipart video upload: POST /api/meeting/:id/recordings
   * form-data: file, takenBy (ops), note (ops)
   */
  const uploadRecordingMultipart = async (
      meetingId,
      blob,
      { filename = `meeting-${meetingId}.webm`, takenBy = 'operator', note = '' } = {}
  ) => {
    if (!meetingId || !blob) throw new Error('missing args for uploadRecordingMultipart');

    // Blob -> File
    const file = (() => {
      try { return new File([blob], filename, { type: blob?.type || 'application/octet-stream' }); }
      catch { const f = blob; f.name = filename; f.lastModified = Date.now(); return f; }
    })();

    const fd = new FormData();
    fd.append('file', file);
    if (takenBy) fd.append('takenBy', takenBy);
    if (note)    fd.append('note', note);

    // TAM URL: API_BASE + path
    const url = `${API_BASE}/api/meeting/${encodeURIComponent(meetingId)}/recordings`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }, // Content-Type YAZMA!
      body: fd,
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) throw new Error(text || `uploadRecordingMultipart failed: ${res.status}`);
    return text ? JSON.parse(text) : {};
  };


  return {
    // reads
    getPendingMeetings,
    getMeeting,
    getMeetingStatus,
    // writes
    startMeeting,
    joinMeeting,
    endMeeting,
    uploadScreenshot,
    uploadRecordingMultipart,
  };
};
