/* KinéScan — détection de pose (MediaPipe Pose Landmarker, hébergé localement : aucun service tiers) */
window.KS = window.KS || {};
KS.pose = (() => {
  const LIB = new URL('../vendor/mediapipe/', document.currentScript.src).href;
  const MODEL = new URL('../models/pose_landmarker_lite.task', document.currentScript.src).href;

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
      const { PoseLandmarker, FilesetResolver } = await import(LIB + 'vision_bundle.mjs');
      const vision = await FilesetResolver.forVisionTasks(LIB + 'wasm');
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
