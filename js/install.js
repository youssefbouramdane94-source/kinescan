/* KinéScan — application installable (PWA) : fonctionnement hors ligne + bouton « Installer ».
   Android / ordinateur : invite d'installation du navigateur.
   iPhone / iPad : Apple n'autorise pas d'invite automatique → mode d'emploi pas à pas. */
window.KS = window.KS || {};
KS.install = (() => {
  const $$ = (s) => [...document.querySelectorAll(s)];
  let deferred = null;

  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);

  // « Plus tard » : l'encart contextuel se fait oublier 30 jours (préférence locale, rien n'est envoyé)
  const DISMISS_KEY = 'ks-install-later', DISMISS_MS = 30 * 864e5;
  function dismissedRecently() {
    try { return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < DISMISS_MS; } catch (e) { return false; }
  }
  let available = false;
  function showCards(on) {
    available = on;
    $$('[data-install-card]').forEach((c) => { c.hidden = !on || (c.hasAttribute('data-dismissible') && dismissedRecently()); });
  }
  function later(btn) {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) { /* stockage bloqué : masquage pour cette visite seulement */ }
    const card = btn.closest('[data-install-card]');
    if (card) card.hidden = true;
  }

  async function install() {
    if (deferred) {
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      if (outcome === 'accepted') showCards(false);
      return;
    }
    const d = document.getElementById('install-ios');
    if (d && d.showModal) d.showModal();
  }

  function init() {
    if ('serviceWorker' in navigator && secure) {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[KinéScan] Mode hors ligne indisponible', e));
    }
    if (standalone()) return; // déjà installée : rien à proposer
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; showCards(true); });
    window.addEventListener('appinstalled', () => {
      deferred = null;
      showCards(false);
      if (KS.toast) KS.toast('KinéScan est installée sur votre écran d’accueil');
    });
    if (isIOS) showCards(true);
    $$('[data-install]').forEach((b) => b.addEventListener('click', install));
    $$('[data-install-dismiss]').forEach((b) => b.addEventListener('click', () => later(b)));
  }

  return { init, standalone, isIOS, get available() { return available; } };
})();
