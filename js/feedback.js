/* KinéScan — « Donner mon avis » (version test).
   Aucun serveur : le message est composé ici puis ouvert dans WhatsApp ou la
   messagerie de l'utilisateur, qui le relit et l'envoie lui-même. */
window.KS = window.KS || {};
KS.feedback = (() => {
  const WHATSAPP = '212753330623';
  const EMAIL = 'kinescancontact@gmail.com';
  const VERSION = 'version test 0.9';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const dlg = $('#feedback');
  let rating = 0;

  function open() {
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  function setRating(n) {
    rating = n;
    $$('[data-rate]', dlg).forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.rate) === n)));
    $('#fb-error').hidden = true;
  }

  // flèches gauche / droite dans le groupe de notes (comportement de boutons radio)
  function onRatingKey(e) {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const next = Math.min(5, Math.max(1, (rating || 3) + (e.key === 'ArrowRight' ? 1 : -1)));
    setRating(next);
    $(`[data-rate="${next}"]`, dlg).focus();
  }

  function toggleChip(chip) {
    const group = chip.parentElement;
    const on = chip.getAttribute('aria-pressed') !== 'true';
    if (group.dataset.single) $$('.chip', group).forEach((c) => c.setAttribute('aria-pressed', 'false'));
    chip.setAttribute('aria-pressed', String(on));
  }

  const picked = (name) => $$(`[data-multi="${name}"] .chip[aria-pressed="true"], [data-single="${name}"] .chip[aria-pressed="true"]`, dlg)
    .map((c) => c.textContent.trim());

  function message() {
    const lines = [`Avis KinéScan (${VERSION})`, `Note : ${rating}/5`];
    const profile = picked('profile');
    const improve = picked('improve');
    const add = picked('add');
    const comment = $('#fb-comment').value.trim();
    if (profile.length) lines.push(`Profil : ${profile[0]}`);
    if (improve.length) lines.push(`À améliorer : ${improve.join(', ')}`);
    if (add.length) lines.push(`À ajouter : ${add.join(', ')}`);
    if (comment) lines.push(`Commentaire : ${comment}`);
    return lines.join('\n');
  }

  function send(channel) {
    if (!rating) {
      $('#fb-error').hidden = false;
      $('[data-rate="1"]', dlg).focus();
      return;
    }
    const text = message();
    const url = channel === 'whatsapp'
      ? `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(text)}`
      : `mailto:${EMAIL}?subject=${encodeURIComponent('Avis KinéScan')}&body=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
    dlg.close();
    KS.toast && KS.toast('Merci : relisez puis envoyez le message pour transmettre votre avis.');
  }

  function init() {
    $$('[data-open-feedback]').forEach((b) => b.addEventListener('click', open));
    $$('[data-rate]', dlg).forEach((b) => b.addEventListener('click', () => setRating(Number(b.dataset.rate))));
    $('.rating', dlg).addEventListener('keydown', onRatingKey);
    $$('.chip', dlg).forEach((c) => c.addEventListener('click', () => toggleChip(c)));
    $('#fb-whatsapp').addEventListener('click', () => send('whatsapp'));
    $('#fb-email').addEventListener('click', () => send('email'));
    // clic sur le fond assombri : fermeture
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }

  return { init, open };
})();
