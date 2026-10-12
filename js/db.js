/* KinéScan — dossiers patients stockés sur l'appareil (IndexedDB).
   Aucun serveur : rien ne quitte le téléphone, sauf la sauvegarde que
   l'utilisateur exporte lui-même dans un fichier. */
window.KS = window.KS || {};
KS.db = (() => {
  const NAME = 'kinescan', VERSION = 1;
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('Stockage local indisponible sur ce navigateur')); return; }
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('patients')) db.createObjectStore('patients', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('measures')) {
          const m = db.createObjectStore('measures', { keyPath: 'id' });
          m.createIndex('patientId', 'patientId');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Fermez les autres onglets de KinéScan puis réessayez'));
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }

  // exécute fn(stores) dans une transaction et résout à la fin de celle-ci
  async function tx(names, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(names, mode);
      const stores = Object.fromEntries([].concat(names).map((n) => [n, t.objectStore(n)]));
      let out;
      Promise.resolve(fn(stores)).then((v) => { out = v; }, reject);
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('Opération annulée'));
    });
  }

  const req2p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  /* ---------- patients ---------- */
  const listPatients = () => tx('patients', 'readonly', (s) => req2p(s.patients.getAll()));
  const getPatient = (id) => tx('patients', 'readonly', (s) => req2p(s.patients.get(id)));

  async function savePatient(p) {
    const now = new Date().toISOString();
    const rec = { ...p, id: p.id || newId(), createdAt: p.createdAt || now, updatedAt: now };
    await tx('patients', 'readwrite', (s) => req2p(s.patients.put(rec)));
    return rec;
  }

  function deletePatient(id) {
    return tx(['patients', 'measures'], 'readwrite', async (s) => {
      const keys = await req2p(s.measures.index('patientId').getAllKeys(id));
      keys.forEach((k) => s.measures.delete(k));
      s.patients.delete(id);
    });
  }

  /* ---------- mesures ---------- */
  const listMeasures = (patientId) =>
    tx('measures', 'readonly', (s) => req2p(s.measures.index('patientId').getAll(patientId)));

  async function addMeasure(m) {
    const rec = { ...m, id: newId(), date: m.date || new Date().toISOString() };
    await tx('measures', 'readwrite', (s) => req2p(s.measures.put(rec)));
    return rec;
  }

  const deleteMeasure = (id) => tx('measures', 'readwrite', (s) => req2p(s.measures.delete(id)));

  /* ---------- sauvegarde / restauration ---------- */
  const blobToDataUrl = (b) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

  async function exportAll() {
    const [patients, measures] = await tx(['patients', 'measures'], 'readonly', (s) =>
      Promise.all([req2p(s.patients.getAll()), req2p(s.measures.getAll())]));
    const out = [];
    for (const m of measures) out.push({ ...m, thumb: m.thumb ? await blobToDataUrl(m.thumb) : null });
    return { app: 'KinéScan', format: 1, exportedAt: new Date().toISOString(), patients, measures: out };
  }

  // validation stricte : le fichier vient de l'extérieur
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const isoDate = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : new Date().toISOString());

  // décodage manuel : fetch(data:) serait bloqué par la CSP (connect-src 'self')
  function dataUrlToBlob(u) {
    const m = typeof u === 'string' && u.length < 4e6 && /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(u);
    if (!m) return null;
    try {
      const bin = atob(m[2]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: m[1] });
    } catch (e) { return null; }
  }

  function cleanPatient(p) {
    if (!p || typeof p.id !== 'string' || !p.id || p.id.length > 64) return null;
    const name = str(p.name, 80).trim();
    if (!name) return null;
    return {
      id: p.id, name, age: num(p.age), sport: str(p.sport, 80),
      dxMed: str(p.dxMed, 600), dxKine: str(p.dxKine, 600), notes: str(p.notes, 2000),
      createdAt: isoDate(p.createdAt), updatedAt: isoDate(p.updatedAt),
    };
  }

  async function cleanMeasure(m, ids) {
    if (!m || typeof m.id !== 'string' || m.id.length > 64 || !ids.has(m.patientId)) return null;
    const items = Array.isArray(m.items) ? m.items.slice(0, 6).map((it) => ({
      label: str(it && it.label, 120), value: str(it && it.value, 40), norm: str(it && it.norm, 160),
    })) : [];
    return {
      id: m.id, patientId: m.patientId, date: isoDate(m.date),
      joint: str(m.joint, 40), jointLabel: str(m.jointLabel, 120), side: m.side === 'G' ? 'G' : m.side === 'D' ? 'D' : '',
      items, thumb: await dataUrlToBlob(m.thumb),
    };
  }

  async function importAll(data) {
    if (!data || data.app !== 'KinéScan' || !Array.isArray(data.patients) || !Array.isArray(data.measures)) {
      throw new Error('Ce fichier n’est pas une sauvegarde KinéScan');
    }
    const patients = data.patients.map(cleanPatient).filter(Boolean);
    const ids = new Set(patients.map((p) => p.id));
    const measures = (await Promise.all(data.measures.map((m) => cleanMeasure(m, ids)))).filter(Boolean);
    await tx(['patients', 'measures'], 'readwrite', (s) => {
      patients.forEach((p) => s.patients.put(p));
      measures.forEach((m) => s.measures.put(m));
    });
    return { patients: patients.length, measures: measures.length };
  }

  // demande au navigateur de ne pas effacer les dossiers quand l'espace manque
  async function persist() {
    try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; }
    catch (e) { return false; }
  }

  return { listPatients, getPatient, savePatient, deletePatient, listMeasures, addMeasure, deleteMeasure, exportAll, importAll, persist };
})();
