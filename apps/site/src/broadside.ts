import { chamber, CHAMBERS, principles, releases, stewardCopy, words } from './copy.ts';
import { element } from './dom.ts';
import { level } from './machine.ts';
import type { State } from './machine.ts';
import { encode } from './route.ts';

export function buildBroadside(host: HTMLElement) {
  const document = host.ownerDocument;
  host.dataset['role'] = 'broadside';
  for (const corner of ['tl', 'br']) {
    const reg = element(document, 'span', { cls: `reg ${corner}` });
    reg.setAttribute('aria-hidden', 'true'); host.append(reg);
  }
  const inner = element(document, 'div', { cls: 'broadside-scroll' });
  inner.tabIndex = 0;
  inner.setAttribute('role', 'group'); inner.setAttribute('aria-label', 'Chamber sheet content');
  const eyebrow = element(document, 'span', { cls: 'eyebrow', role: 'broadside-eyebrow' });
  const title = element(document, 'h2', { id: 'broadside-title', cls: 'display ghost', role: 'broadside-title' });
  host.setAttribute('aria-labelledby', title.id);
  const fn = element(document, 'div', { cls: 'fn serif', role: 'broadside-fn' });
  const line = element(document, 'p', { cls: 'line', role: 'broadside-line' });
  const notes = element(document, 'ol');
  const rows = Array.from({ length: 4 }, (_, index) => {
    const row = element(document, 'li', { role: 'broadside-note' });
    const disc = element(document, 'span', { cls: 'n', role: 'broadside-disc', text: String(index + 1) });
    const content = element(document, 'span');
    const lead = element(document, 'b'), text = element(document, 'span');
    content.append(lead, text); row.append(disc, content); notes.append(row);
    return { lead, text };
  });
  const body = element(document, 'p', { cls: 'body' });
  const fine = element(document, 'p', { cls: 'fine', text: words.fine });
  const promises = element(document, 'div', { cls: 'principles' });
  const study = element(document, 'div', { cls: 'steward-content' });
  const studyScroll = element(document, 'div', { cls: 'steward-scroll' });
  studyScroll.tabIndex = 0;
  studyScroll.setAttribute('role', 'region');
  studyScroll.setAttribute('aria-label', 'Six principles and project notices');
  const hint = element(document, 'span', { cls: 'scroll-hint', text: 'More below ↓' });
  study.append(studyScroll, hint);
  studyScroll.addEventListener('scroll', () => {
    const more = studyScroll.scrollTop + studyScroll.clientHeight < studyScroll.scrollHeight - 1;
    study.dataset['more'] = String(more);
    hint.textContent = more ? 'More below ↓' : 'End of principles and notices';
  });
  for (const [lead, text] of principles) {
    const row = element(document, 'div', { role: 'principle' });
    row.append(element(document, 'b', { text: lead }), element(document, 'span', { text }));
    promises.append(row);
  }
  const notices = element(document, 'div', { cls: 'steward-notices fine' });
  for (const notice of stewardCopy.notices) {
    const paragraph = element(document, 'p');
    if ('href' in notice) {
      const link = element(document, 'a', { text: notice.text }); link.href = notice.href; paragraph.append(link);
    } else paragraph.textContent = notice.text;
    notices.append(paragraph);
  }
  const links = element(document, 'nav'); links.setAttribute('aria-label', 'Project links');
  for (const item of stewardCopy.links) {
    const link = element(document, 'a', { text: item.text }); link.href = item.href; links.append(link);
  }
  notices.append(links);
  studyScroll.append(promises, notices);
  const actions = element(document, 'div', { cls: 'acts' });
  const inside = element(document, 'a', { cls: 'btn primary', role: 'broadside-action' });
  const get = element(document, 'a', { cls: 'btn', role: 'broadside-action', text: 'Get the app →' });
  get.href = releases; actions.append(inside, get);
  const pager = element(document, 'nav', { cls: 'pager', role: 'broadside-pager' });
  pager.setAttribute('aria-label', 'Chambers');
  const prev = element(document, 'a'), count = element(document, 'span'), next = element(document, 'a');
  pager.append(prev, count, next);
  inner.append(eyebrow, title, fn, line, notes, body, fine, study, actions, pager);
  host.append(inner);
  let previous = '';

  function update(state: State, reduced: boolean): void {
    if (level(state) === 0) { previous = ''; return; }
    const key = `${state.room}:${state.phase}`;
    if (key === previous) return;
    previous = key;
    const copy = chamber(state.room), isStudy = state.room === 'steward', detail = state.phase === 'features';
    host.dataset['kind'] = isStudy ? 'steward' : detail ? 'features' : 'room';
    eyebrow.textContent = isStudy ? 'The Steward’s study · principles'
      : `Chamber ${copy!.n} of 4 · ${detail ? 'detail' : copy!.fn}`;
    title.textContent = isStudy ? words.steward_title : detail ? `Inside the ${copy!.name}` : copy!.name;
    title.classList.toggle('slip', !reduced);
    title.classList.toggle('slip-again');
    fn.hidden = isStudy || detail; fn.textContent = copy?.fn ?? '';
    line.hidden = detail; line.textContent = isStudy ? words.steward_lead : copy?.line ?? '';
    notes.hidden = isStudy || detail;
    rows.forEach((row, index) => {
      row.lead.textContent = copy ? `${copy.notes[index]![0]}.` : '';
      row.text.textContent = copy ? ` ${copy.notes[index]![1]}` : '';
    });
    body.hidden = !detail || isStudy; body.textContent = copy?.inside ?? '';
    fine.hidden = !detail || isStudy; promises.hidden = !isStudy; notices.hidden = !isStudy; actions.hidden = isStudy;
    study.hidden = !isStudy; inner.tabIndex = isStudy ? -1 : 0;
    inside.textContent = detail ? `← Back to the ${copy?.name}` : `Inside the ${copy?.name} →`;
    if (copy) inside.href = encode({ room: copy.id, features: !detail });
    inside.classList.toggle('primary', !detail); get.classList.toggle('primary', detail);
    prev.textContent = isStudy ? '← The whole keep' : `← ${CHAMBERS[(copy!.n + 2) % 4]!.name}`;
    next.textContent = isStudy ? 'Get the app →' : `${CHAMBERS[copy!.n % 4]!.name} →`;
    prev.href = isStudy ? '#' : encode({ room: CHAMBERS[(copy!.n + 2) % 4]!.id, features: detail });
    next.href = isStudy ? releases : encode({ room: CHAMBERS[copy!.n % 4]!.id, features: detail });
    count.textContent = isStudy ? 'In development' : `${copy!.n} / 4`;
    studyScroll.scrollTop = 0; study.dataset['more'] = 'true'; hint.textContent = 'More below ↓';
    inner.scrollTop = 0;
    inner.classList.toggle('print-in', !reduced);
    inner.classList.toggle('print-again');
  }
  return { update, notices };
}
