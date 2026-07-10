/* KinéScan — détection de pose (MediaPipe Pose Landmarker, chargé via CDN) */
window.KS = window.KS || {};
KS.pose = (() => {
  const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

  let landmarker = null;
  let status = 'chargement';
  const listeners = [];

  function set(s) {
    status = s;
    listeners.forEach((fn) => fn(s));
  }

  function onStatus(fn) {
    listeners.push(fn);
    fn(status);
  }

  async function init() {
    try {
      const { PoseLandmarker, FilesetResolver } = await import(CDN + '/+esm');
      const vision = await FilesetResolver.forVisionTasks(CDN + '/wasm');
      landmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL },
        runningMode: 'IMAGE',
        numPoses: 1,
      });
      set('prêt');
      console.log('[KinéScan] Modèle de pose chargé.');
    } catch (e) {
      console.warn('[KinéScan] MediaPipe indisponible — mode manuel uniquement.', e);
      set('indisponible');
    }
  }

  // Retourne les 33 landmarks normalisés (x, y, visibility) ou null
  async function detect(img) {
    if (!landmarker) return null;
    try {
      const res = landmarker.detect(img);
      return (res.landmarks && res.landmarks[0]) || null;
    } catch (e) {
      console.warn('[KinéScan] Échec de détection', e);
      return null;
    }
  }

  return { init, detect, onStatus, get status() { return status; } };
})();
