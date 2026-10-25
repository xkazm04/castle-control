/* Castle Control mark: one component for every page.
   A chat bubble whose top edge is a crenellated keep wall, printed in gules; the gate is lit in or,
   laid on a hair out of register so the two inks overlap at the jamb. */
(function (W, D) {
  'use strict';
  var CC = (W.CC = W.CC || {});
  var WALL = 'M6 6h9v7h8V6h9v7h8V6h9v7h8V6h9v42a4 4 0 0 1-4 4H27l-12 10V52h-5a4 4 0 0 1-4-4Z';
  var GATE = 'M28 52V39a8 8 0 0 1 16 0V52Z';
  CC.markSVG = function (cls) {
    return '<svg class="' + (cls || 'mark') + '" viewBox="0 0 72 64" role="img" aria-label="Castle Control mark: a chat bubble topped with battlements, its gate lit">' +
      '<path d="' + WALL + GATE + '" fill="var(--gules)" fill-rule="evenodd"/>' +
      '<path d="' + GATE + '" transform="translate(1.6 -1.4)" fill="var(--or)" style="mix-blend-mode:var(--blend)"/></svg>';
  };
  /* any element with data-mark gets the mark (landing, brand sheet) */
  function fill() { Array.prototype.forEach.call(D.querySelectorAll('[data-mark]'), function (el) { el.innerHTML = CC.markSVG(el.getAttribute('data-mark') || 'mark'); }); }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', fill); else fill();
})(window, document);
