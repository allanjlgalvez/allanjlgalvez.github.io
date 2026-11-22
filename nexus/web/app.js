/* NEXUS — interfaz (JavaScript sin dependencias, salvo Cytoscape para los diagramas) */
'use strict';

/* ================= Utilidades ================= */

const $ = (s, el = document) => el.querySelector(s);

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  const add = k => {
    if (k == null || k === false) return;
    if (Array.isArray(k)) return k.forEach(add);
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  };
  kids.forEach(add);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.entries(v).forEach(([p, x]) => el.style.setProperty(p, x));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' || k === 'checked' || k === 'selected') el[k] = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  return el;
}

const ICONS = {
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  car: '<path d="M3 17v-4l2.2-6h13.6l2.2 6v4"/><path d="M3 13h18"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>',
  paw: '<circle cx="5" cy="10" r="2"/><circle cx="9" cy="5.5" r="2"/><circle cx="15" cy="5.5" r="2"/><circle cx="19" cy="10" r="2"/><path d="M12 11c-3 0-6 4-6 7 0 2 2 3 3.5 2.5S11 20 12 20s1 1 2.5.5S18 20 18 18c0-3-3-7-6-7z"/>',
  home: '<path d="M3 11l9-8 9 8M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  building: '<path d="M4 3h16v18H4z"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3"/>',
  heart: '<path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  briefcase: '<path d="M3 7h18v13H3z"/><path d="M9 7V4h6v3M3 12h18"/>',
  plane: '<path d="M10 4l2 0 3 7h5l1 2h-6l-3 7h-2l1.5-7H7l-1.5 2H4l1-3-1-3h1.5L7 11h4.5z"/>',
  bolt: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
  graph: '<circle cx="5" cy="6" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M6.2 8.3l4.6 7.4M17.8 8.3l-4.6 7.4M7.5 6h9"/>',
  list: '<path d="M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h11"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
  camera: '<path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13.5" r="3.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  logout: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
  tree: '<path d="M9 3h6v4H9zM3 17h6v4H3zM15 17h6v4h-6z"/><path d="M12 7v5M6 17v-5h12v5"/>',
  orbit: '<circle cx="12" cy="12" r="2.5"/><circle cx="12" cy="12" r="8.5"/><circle cx="18" cy="6" r="1.6"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  focus: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><circle cx="12" cy="12" r="2.5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/>',
  db: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.5"/><path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5"/>',
  cake: '<path d="M4 21h16v-8H4z"/><path d="M4 16.5c2 1.2 3-1 4 0s2 1 4 0 2-1 4 0 3 1.2 4 0M12 13V9.5M12 6.5v-.5"/>',
  swap: '<path d="M7 4L3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  image: '<path d="M3 4h18v16H3z"/><circle cx="9" cy="10" r="2"/><path d="M3 18l6-5 4 3 3-2 5 4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  broom: '<path d="M20 3l-7.5 7.5"/><path d="M11 9l4 4-2.5 7.5L4 12z"/><path d="M7 14.5l-3 3M9.5 17l-2 3"/>',
  check: '<path d="M4 12.5l5 5L20 6.5"/>',
  undo: '<path d="M9 5L4 10l5 5"/><path d="M4 10h10a6 6 0 0 1 0 12h-3"/>',
  skip: '<path d="M12 4v13M6 11l6 6 6-6M5 21h14"/>',
  restore: '<path d="M4 4v6h6"/><path d="M5 10a8 8 0 1 1 2 6"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  merge: '<path d="M6 3v6a6 6 0 0 0 6 6h0a6 6 0 0 1 6 6"/><path d="M18 3v6a6 6 0 0 1-6 6"/><path d="M15 18l3 3 3-3"/>',
};
const ENTITY_ICONS = ['person', 'car', 'paw', 'home', 'building', 'heart', 'star', 'briefcase', 'plane', 'bolt'];

const svgOf = (name, color = 'currentColor', w = 1.8) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="square" stroke-linejoin="miter">${ICONS[name] || ICONS.star}</svg>`;
function ic(name) {
  const t = document.createElement('template');
  t.innerHTML = svgOf(name);
  return t.content.firstChild;
}
const iconURI = (name, color) => 'data:image/svg+xml;utf8,' + encodeURIComponent(svgOf(name, color, 1.6).replace('<svg ', '<svg width="96" height="96" '));

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const today = () => new Date().toLocaleDateString('sv'); // AAAA-MM-DD local
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fmtDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? `${+m[3]} ${MESES[+m[2] - 1]} ${m[1]}` : (s || '');
}
function age(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  if (!m) return null;
  const n = new Date();
  let a = n.getFullYear() - m[1];
  if (n.getMonth() + 1 < +m[2] || (n.getMonth() + 1 === +m[2] && n.getDate() < +m[3])) a--;
  return a >= 0 && a < 150 ? a : null;
}
const fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1073741824).toFixed(2) + ' GB';
function slug(s) {
  return norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'campo';
}

async function api(method, url, body) {
  const o = { method, headers: { 'X-Nexus': '1' } };
  if (body instanceof FormData) o.body = body;
  else if (body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
  let r;
  try { r = await fetch(url, o); } catch { throw new Error('Sin conexión con NEXUS. ¿Está abierto en la PC?'); }
  if (r.status === 401 && !url.startsWith('/api/login') && !url.startsWith('/api/password')) {
    showGate();
    throw new Error('Tu sesión terminó');
  }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : r;
  if (!r.ok) throw new Error((data && data.error) || r.statusText || 'Error');
  return data;
}

function toast(msg, err) {
  const t = h('div', { class: 'toast cut' + (err ? ' err' : '') }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), err ? 5000 : 2600);
}
const fail = e => toast(e.message || String(e), true);

function modal(title, body, { wide, onclose } = {}) {
  const close = () => { if (!bg.isConnected) return; bg.remove(); document.removeEventListener('keydown', esc); onclose && onclose(); };
  const esc = e => { if (e.key === 'Escape') close(); };
  const box = h('div', { class: 'modal cut' + (wide ? ' wide' : '') },
    h('button', { class: 'ibtn x', title: 'Cerrar', onclick: close }, ic('x')),
    h('h1', null, title), body);
  const bg = h('div', { class: 'modal-bg', onmousedown: e => { if (e.target === bg) close(); } }, box);
  document.addEventListener('keydown', esc);
  document.body.append(bg);
  setTimeout(() => { const f = box.querySelector('input:not([type=hidden]),textarea'); f && f.focus(); }, 30);
  return close;
}

function confirmDlg(title, text, ok = 'Borrar') {
  return new Promise(res => {
    let val = false;
    const close = modal(title, h('div', null,
      h('p', { class: 'muted' }, text),
      h('div', { class: 'acts' },
        h('button', { class: 'btn mut', onclick: () => close() }, 'Cancelar'),
        h('button', { class: 'btn mg solid', onclick: () => { val = true; close(); } }, ok))),
      { onclose: () => res(val) });
  });
}

/* ================= Estado ================= */

const S = {
  types: [], entities: [], relations: [],
  E: new Map(), T: new Map(),
  cys: [], logged: false,
  hidden: new Set(JSON.parse(localStorage.getItem('nx.hidden') || '[]')),
};

async function loadAll() {
  const d = await api('GET', '/api/all');
  S.types = d.types; S.entities = d.entities; S.relations = d.relations;
  S.T = new Map(S.types.map(t => [t.id, t]));
  S.E = new Map(S.entities.map(e => [e.id, e]));
  S.types.forEach(t => { if (!t.schema || !Array.isArray(t.schema.sections)) t.schema = { sections: [] }; });
  S.entities.forEach(e => {
    if (!Array.isArray(e.tags)) e.tags = [];
    if (!e.data || typeof e.data !== 'object') e.data = {};
  });
}

const FALLBACK_TYPE = { id: 0, name: 'Sin tipo', color: '#6d7d93', icon: 'star', shape: 'ellipse', schema: { sections: [] } };
const typeOf = e => S.T.get(e.type_id) || FALLBACK_TYPE;
const photoURL = (e, thumb = true) => e && e.photo_id ? `/files/${e.photo_id}${thumb ? '/thumb' : ''}` : null;
const fieldsOf = t => t.schema.sections.flatMap(s => s.fields || []);
const hasVal = v => v !== undefined && v !== null && v !== '' && v !== false;
const allTags = () => [...new Set(S.entities.flatMap(e => e.tags))].sort((a, b) => a.localeCompare(b));

function avatar(e, cls = '') {
  const t = typeOf(e);
  const u = photoURL(e);
  const round = t.shape === 'ellipse' ? ' round' : '';
  return h('div', { class: 'av' + round + ' ' + cls, style: { '--c': t.color, ...(u ? { 'background-image': `url("${u}")` } : {}) } }, u ? null : ic(t.icon));
}

function fmtValue(f, v) {
  if (f.type === 'checkbox') return v ? 'Sí' : 'No';
  if (f.type === 'date') {
    const a = /nacimiento/.test(f.key) ? age(v) : null;
    return a != null ? [fmtDate(v), ' ', h('small', null, `(${a} años)`)] : fmtDate(v);
  }
  if (f.type === 'phone') return h('a', { href: 'tel:' + String(v).replace(/[^\d+]/g, '') }, v);
  if (f.type === 'email') return h('a', { href: 'mailto:' + v }, v);
  if (f.type === 'url') {
    const u = /^https?:\/\//i.test(v) ? v : 'https://' + v;
    return h('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, v);
  }
  return String(v);
}

function summary(e, n = 2) {
  const out = [];
  for (const f of fieldsOf(typeOf(e))) {
    if (f.type === 'textarea' || f.type === 'checkbox') continue;
    const v = e.data[f.key];
    if (hasVal(v)) out.push(f.type === 'date' ? fmtDate(v) : String(v));
    if (out.length >= n) break;
  }
  return out.join(' · ');
}

function upcomingBirthdays(days = 45) {
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const out = [];
  for (const e of S.entities) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(e.data.fecha_nacimiento || '');
    if (!m) continue;
    let nx = new Date(t0.getFullYear(), m[2] - 1, +m[3]);
    if (nx < t0) nx = new Date(t0.getFullYear() + 1, m[2] - 1, +m[3]);
    const d = Math.round((nx - t0) / 864e5);
    if (d <= days) out.push({ e, d, turns: nx.getFullYear() - m[1] });
  }
  return out.sort((a, b) => a.d - b.d);
}

/* ================= Acceso ================= */

async function boot() {
  try { await document.fonts.load('700 13px Rajdhani'); await document.fonts.load('900 20px Orbitron'); } catch { }
  let st;
  try { st = await api('GET', '/api/state'); } catch (e) { $('#app').textContent = e.message; return; }
  if (!st.logged) return showGate(st.setup);
  await enter();
}

async function enter() {
  S.logged = true;
  await loadAll();
  renderShell();
  route();
}

const logoEl = () => h('div', { class: 'logo', onclick: () => { location.hash = '#/red'; } },
  (() => { const t = document.createElement('template'); t.innerHTML = '<svg viewBox="0 0 64 64"><path d="M32 6l22 13v26L32 58 10 45V19z" fill="none" stroke="#00f0ff" stroke-width="4"/><path d="M23 42V22l18 20V22" fill="none" stroke="#ff2a6d" stroke-width="5" stroke-linejoin="bevel"/></svg>'; return t.content.firstChild; })(),
  h('span', null, 'NEX', h('b', null, 'U'), 'S'));

async function showGate(setup) {
  S.logged = false;
  destroyCys();
  document.querySelectorAll('.modal-bg').forEach(m => m.remove());
  if (setup === undefined) { try { setup = (await api('GET', '/api/state')).setup; } catch { setup = false; } }
  const err = h('div', { class: 'err' });
  const pw = h('input', { type: 'password', autocomplete: setup ? 'new-password' : 'current-password', placeholder: 'Contraseña', required: true });
  const pw2 = setup ? h('input', { type: 'password', autocomplete: 'new-password', placeholder: 'Repite la contraseña', required: true }) : null;
  const go = h('button', { class: 'btn solid', type: 'submit' }, setup ? 'Crear acceso' : 'Entrar');
  const form = h('form', {
    onsubmit: async ev => {
      ev.preventDefault(); err.textContent = '';
      if (setup && pw.value !== pw2.value) { err.textContent = 'Las contraseñas no coinciden'; return; }
      go.disabled = true;
      try {
        await api('POST', setup ? '/api/setup' : '/api/login', { password: pw.value });
        await enter();
      } catch (e) { err.textContent = e.message; pw.select(); }
      go.disabled = false;
    }
  },
    pw, pw2, err, go,
    setup ? h('p', { class: 'hint' }, 'Primera vez: crea la contraseña que protegerá tus datos. Guárdala bien; no hay forma de recuperarla.') : null);
  $('#app').replaceChildren(h('div', { class: 'gate' },
    h('div', { class: 'box panel cut' },
      h('div', { class: 'kick' }, setup ? 'Inicialización del sistema' : 'Acceso restringido'),
      h('div', { class: 'logo glitch' }, logoEl().childNodes[0].cloneNode(true), h('span', null, 'NEX', h('b', null, 'U'), 'S')),
      h('div', { class: 'muted' }, 'Base de datos personal · local'),
      form)));
  pw.focus();
}

/* ================= Estructura ================= */

let viewEl, navEl;

function renderShell() {
  navEl = h('nav', { class: 'nav' },
    h('a', { href: '#/red', dataset: { r: 'red' } }, ic('graph'), h('span', null, 'Red')),
    h('a', { href: '#/lista', dataset: { r: 'lista' } }, ic('list'), h('span', null, 'Registros')),
    h('a', { href: '#/depurador', dataset: { r: 'depurador' } }, ic('broom'), h('span', null, 'Depurador')),
    h('a', { href: '#/ajustes', dataset: { r: 'ajustes' } }, ic('gear'), h('span', null, 'Sistema')));
  viewEl = h('main', { class: 'view' });
  $('#app').replaceChildren(
    h('header', { class: 'top' }, logoEl(), navEl, h('div', { class: 'sp' }), searchBox(),
      h('button', { class: 'btn solid newbtn', onclick: () => newEntityDlg() }, ic('plus'), h('span', null, 'Nuevo'))),
    viewEl);
}

window.addEventListener('hashchange', () => S.logged && route());
document.addEventListener('keydown', e => {
  if (!S.logged) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
  if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
    e.preventDefault(); $('.search input')?.focus();
  }
});

function route() {
  destroyCys();
  if (S.leave) { const f = S.leave; S.leave = null; try { f(); } catch { } }
  const p = (location.hash.slice(2) || 'red').split('/');
  navEl.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.r === (p[0] === 'e' ? 'lista' : p[0] === 'tipo' ? 'ajustes' : p[0])));
  viewEl.className = 'view';
  viewEl.scrollTop = 0;
  document.documentElement.style.setProperty('--acc', 'var(--cy)');
  switch (p[0]) {
    case 'lista': return viewList();
    case 'e': return viewEntity(+p[1], p[2] === 'editar');
    case 'ajustes': return viewSettings();
    case 'depurador': return viewCleaner(p[1] || 'duplicados');
    case 'tipo': return viewTypeEditor(p[1] === 'nuevo' ? null : +p[1]);
    default: return viewGraph();
  }
}

async function refresh() { await loadAll(); route(); }

/* ================= Búsqueda ================= */

function searchBox() {
  const input = h('input', { type: 'search', placeholder: 'Buscar personas, placas, notas…', autocomplete: 'off', spellcheck: 'false' });
  const box = h('div', { class: 'search' }, ic('search'), input, h('kbd', null, 'Ctrl K'));
  let res = null, sel = 0, timer, items = [];
  const close = () => { res && res.remove(); res = null; };
  const go = it => { close(); input.value = ''; input.blur(); location.hash = '#/e/' + it.id + (it.tab ? '' : ''); if (it.tab) sessionStorage.setItem('nx.tab', it.tab); };
  const draw = (ents, evs) => {
    close();
    items = [];
    res = h('div', { class: 'results cut' });
    if (ents.length) res.append(h('div', { class: 'grp' }, 'Registros'));
    ents.forEach(m => {
      items.push({ id: m.e.id });
      res.append(h('div', { class: 'res', onmousedown: ev => { ev.preventDefault(); go({ id: m.e.id }); } },
        avatar(m.e), h('div', null, h('div', { class: 't' }, m.e.name), h('div', { class: 's' }, m.why))));
    });
    if (evs.length) res.append(h('div', { class: 'grp' }, 'En notas y eventos'));
    evs.forEach(x => {
      const e = S.E.get(x.entity_id); if (!e) return;
      items.push({ id: e.id, tab: 'timeline' });
      res.append(h('div', { class: 'res', onmousedown: ev => { ev.preventDefault(); go({ id: e.id, tab: 'timeline' }); } },
        avatar(e), h('div', null, h('div', { class: 't' }, e.name + ' · ' + (x.title || fmtDate(x.date))), h('div', { class: 's' }, x.snippet))));
    });
    if (!items.length) res.append(h('div', { class: 'empty-res' }, 'Sin resultados'));
    box.append(res);
    sel = 0; mark();
  };
  const mark = () => res && res.querySelectorAll('.res').forEach((r, i) => r.classList.toggle('sel', i === sel));
  const find = q => {
    const n = norm(q).trim();
    if (!n) return [];
    const out = [];
    for (const e of S.entities) {
      let why = null;
      if (norm(e.name).includes(n)) why = typeOf(e).name + (summary(e, 1) ? ' · ' + summary(e, 1) : '');
      else if (e.tags.some(t => norm(t).includes(n))) why = '#' + e.tags.find(t => norm(t).includes(n));
      else {
        const t = typeOf(e);
        for (const [k, v] of Object.entries(e.data)) {
          if (hasVal(v) && norm(v).includes(n)) {
            const f = fieldsOf(t).find(f => f.key === k);
            why = (f ? f.label : k) + ': ' + v; break;
          }
        }
      }
      if (why) out.push({ e, why, score: norm(e.name).startsWith(n) ? 0 : 1 });
    }
    return out.sort((a, b) => a.score - b.score).slice(0, 8);
  };
  input.addEventListener('input', () => {
    const q = input.value;
    clearTimeout(timer);
    if (!q.trim()) return close();
    const ents = find(q);
    draw(ents, []);
    timer = setTimeout(async () => {
      if (q.trim().length < 2) return;
      try { const evs = await api('GET', '/api/search?q=' + encodeURIComponent(q)); if (input.value === q) draw(ents, evs.slice(0, 6)); } catch { }
    }, 250);
  });
  input.addEventListener('keydown', e => {
    if (!res) return;
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); mark(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); mark(); e.preventDefault(); }
    else if (e.key === 'Enter' && items[sel]) go(items[sel]);
    else if (e.key === 'Escape') { close(); input.blur(); }
  });
  input.addEventListener('blur', () => setTimeout(close, 120));
  return box;
}

/* ================= Diagramas (Cytoscape) ================= */

const CY_STYLE = [
  {
    selector: 'node', style: {
      width: 50, height: 50, shape: 'data(shape)', 'background-color': '#0d1219',
      'background-image': 'data(img)', 'background-fit': 'cover', 'background-clip': 'node',
      'background-image-crossorigin': 'use-credentials',
      'border-width': 2, 'border-color': 'data(color)',
      label: 'data(label)', color: '#d6e2ef', 'font-family': 'Rajdhani', 'font-weight': 700, 'font-size': 13,
      'text-valign': 'bottom', 'text-margin-y': 7, 'text-transform': 'uppercase',
      'text-outline-color': '#07090d', 'text-outline-width': 3, 'text-max-width': 120, 'text-wrap': 'ellipsis',
      'underlay-color': 'data(color)', 'underlay-opacity': 0, 'underlay-padding': 7, 'underlay-shape': 'ellipse',
      'transition-property': 'opacity, underlay-opacity, border-width', 'transition-duration': '160ms',
    }
  },
  { selector: 'node[?icon]', style: { 'background-fit': 'none', 'background-width': '52%', 'background-height': '52%' } },
  {
    selector: 'edge', style: {
      width: 1.6, 'line-color': '#2b3b52', 'target-arrow-color': '#2b3b52', 'target-arrow-shape': 'triangle', 'arrow-scale': .8,
      'curve-style': 'bezier', label: 'data(label)', 'font-family': 'Rajdhani', 'font-size': 11, 'font-weight': 700,
      color: '#6d7d93', 'text-rotation': 'autorotate', 'text-background-color': '#07090d', 'text-background-opacity': .9,
      'text-background-padding': 2, 'text-transform': 'uppercase',
      'transition-property': 'opacity, line-color', 'transition-duration': '160ms',
    }
  },
  { selector: 'edge.taxi', style: { 'curve-style': 'taxi', 'taxi-direction': 'downward', 'taxi-turn': '50%', 'text-rotation': 'none' } },
  { selector: '.faded', style: { opacity: .1 } },
  { selector: 'node.hl', style: { 'border-width': 3, 'underlay-opacity': .28 } },
  { selector: 'edge.hl', style: { 'line-color': '#00f0ff', 'target-arrow-color': '#00f0ff', color: '#d6e2ef', width: 2.2 } },
  { selector: 'node.root', style: { width: 84, height: 84, 'border-width': 3, 'underlay-opacity': .3, 'font-size': 15 } },
  { selector: 'node.far', style: { width: 30, height: 30, opacity: .55, 'font-size': 10 } },
];

function nodeOf(e, extra = {}) {
  const t = typeOf(e);
  const u = photoURL(e);
  return { group: 'nodes', data: { id: 'n' + e.id, eid: e.id, label: e.name, color: t.color, shape: t.shape, img: u || iconURI(t.icon, t.color), icon: !u, ...extra } };
}
const edgeOf = r => ({ group: 'edges', data: { id: 'r' + r.id, source: 'n' + r.from_id, target: 'n' + r.to_id, label: r.label } });

function makeCy(container, elements) {
  const cy = cytoscape({ container, elements, style: CY_STYLE, wheelSensitivity: .35, minZoom: .12, maxZoom: 3.5, pixelRatio: 'auto' });
  S.cys.push(cy);
  return cy;
}

// Detiene animaciones antes de destruir los diagramas (evita errores al cambiar de pantalla).
function runLayout(cy, opts) {
  const prev = cy.scratch('_nxLayout');
  if (prev) prev.stop();
  const l = cy.layout(opts);
  cy.scratch('_nxLayout', l);
  cy.scratch('_nxRunning', true);
  l.one('layoutstop', () => cy.scratch('_nxRunning', false));
  l.run();
}
function destroyCys() {
  S.cys.forEach(c => {
    try {
      const l = c.scratch('_nxLayout'); if (l) l.stop();
      c.elements().stop(true, true); c.stop(true, true);
      c.destroy();
    } catch { }
  });
  S.cys = [];
}

function layoutOpts(cy, mode) {
  const base = { animate: true, animationDuration: 550, padding: innerWidth < 860 ? 40 : 110, fit: true };
  cy.edges().toggleClass('taxi', mode === 'arbol');
  if (mode === 'arbol') {
    const roots = cy.elements().components().map(c => c.nodes().max(n => n.degree()).ele);
    return { ...base, name: 'breadthfirst', directed: false, roots: cy.collection(roots), spacingFactor: 1.15, avoidOverlap: true };
  }
  if (mode === 'orbita') return { ...base, name: 'concentric', concentric: n => n.degree(), levelWidth: () => 2, minNodeSpacing: 40, avoidOverlap: true };
  return { ...base, animate: 'end', name: 'cose', nodeDimensionsIncludeLabels: true, nodeOverlap: 20, nodeRepulsion: () => 16000, idealEdgeLength: () => 150, gravity: .3, numIter: 1500, randomize: true, componentSpacing: 90 };
}

function highlight(cy, node) {
  cy.elements().removeClass('hl').addClass('faded');
  node.closedNeighborhood().removeClass('faded').addClass('hl');
}
function clearHighlight(cy) { cy.elements().removeClass('faded hl'); }

/* ================= Vista: RED ================= */

function viewGraph() {
  viewEl.className = 'view full';
  const mode = localStorage.getItem('nx.layout') || 'red';
  const cyEl = h('div', { id: 'cy' });
  const peekEl = h('div');
  viewEl.replaceChildren(cyEl, peekEl);

  if (!S.entities.length) {
    viewEl.append(h('div', { class: 'emptyst' }, h('div', null,
      h('div', { class: 'pulse' }, ic('graph')),
      h('div', { class: 'big' }, 'RED VACÍA'),
      h('p', { class: 'muted' }, 'Agrega a tu primer contacto. Después conecta familiares, amigos, vehículos y mascotas para ver tu red como un diagrama.'),
      h('div', { style: { display: 'flex', gap: '10px', 'justify-content': 'center', 'flex-wrap': 'wrap' } },
        h('button', { class: 'btn solid', onclick: () => newEntityDlg() }, ic('plus'), 'Agregar contacto'),
        h('button', { class: 'btn', onclick: () => importDlg() }, ic('download'), 'Importar de Google')))));
    return;
  }

  // HUD: conteos por tipo (también sirven de filtro)
  const stats = h('div', { class: 'hud tl cut' },
    h('h3', null, 'Registros'),
    h('div', { class: 'total' }, h('b', null, S.entities.length), h('span', { class: 'muted' }, `${S.relations.length} conexiones`)),
    S.types.filter(t => t.count).map(t => h('div', {
      class: 'stat' + (S.hidden.has(t.id) ? ' off' : ''), style: { '--c': t.color }, title: 'Mostrar / ocultar',
      onclick: () => {
        S.hidden.has(t.id) ? S.hidden.delete(t.id) : S.hidden.add(t.id);
        localStorage.setItem('nx.hidden', JSON.stringify([...S.hidden]));
        route();
      }
    }, h('span', { class: 'ic' }, ic(t.icon)), h('span', { class: 'l' }, t.name), h('span', { class: 'n' }, t.count))));
  viewEl.append(stats);

  const bd = upcomingBirthdays();
  viewEl.append(h('div', { class: 'hud tr cut' },
    h('h3', null, 'Próximos cumpleaños'),
    bd.length ? bd.slice(0, 6).map(b => h('div', { class: 'bday', onclick: () => location.hash = '#/e/' + b.e.id },
      avatar(b.e), h('div', null, h('div', { style: { 'font-weight': 700 } }, b.e.name), h('div', { class: 'muted', style: { 'font-size': '13px' } }, `Cumple ${b.turns}`)),
      h('span', { class: 'd' + (b.d === 0 ? ' today' : '') }, b.d === 0 ? '¡HOY!' : b.d === 1 ? 'MAÑANA' : `${b.d} DÍAS`)))
      : h('div', { class: 'muted' }, 'Nadie cumple años en los próximos 45 días.')));

  const segs = [['red', 'graph', 'Red'], ['arbol', 'tree', 'Árbol'], ['orbita', 'orbit', 'Órbita']].map(([m, i, l]) =>
    h('button', { class: 'seg' + (m === mode ? ' on' : ''), onclick: ev => { localStorage.setItem('nx.layout', m); segBar.querySelectorAll('.seg').forEach(b => b.classList.toggle('on', b === ev.currentTarget)); runLayout(cy, layoutOpts(cy, m)); } }, ic(i), h('span', null, l)));
  const segBar = h('div', { class: 'hud bl cut' }, segs);
  viewEl.append(segBar,
    h('div', { class: 'hud br cut' },
      h('button', { class: 'seg', title: 'Ajustar a pantalla', onclick: () => cy.animate({ fit: { padding: 60 } }, { duration: 400 }) }, ic('fit'), h('span', null, 'Ajustar'))));

  const vis = S.entities.filter(e => !S.hidden.has(e.type_id));
  const ids = new Set(vis.map(e => e.id));
  const els = [...vis.map(e => nodeOf(e)), ...S.relations.filter(r => ids.has(r.from_id) && ids.has(r.to_id)).map(edgeOf)];
  const cy = makeCy(cyEl, els);
  runLayout(cy, layoutOpts(cy, mode));

  const closePeek = () => { peekEl.replaceChildren(); viewEl.classList.remove('peeking'); clearHighlight(cy); };
  cy.on('tap', 'node', ev => { highlight(cy, ev.target); viewEl.classList.add('peeking'); showPeek(peekEl, S.E.get(ev.target.data('eid')), cy, closePeek); });
  cy.on('dbltap', 'node', ev => { location.hash = '#/e/' + ev.target.data('eid'); });
  cy.on('tap', ev => { if (ev.target === cy) closePeek(); });
  cy.on('mouseover', 'node', ev => { if (!peekEl.firstChild) highlight(cy, ev.target); cyEl.style.cursor = 'pointer'; });
  cy.on('mouseout', 'node', () => { if (!peekEl.firstChild) clearHighlight(cy); cyEl.style.cursor = ''; });
}

function relationsOf(id) {
  return S.relations.filter(r => r.from_id === id || r.to_id === id)
    .map(r => ({ r, other: S.E.get(r.from_id === id ? r.to_id : r.from_id), out: r.from_id === id }))
    .filter(x => x.other);
}

function showPeek(el, e, cy, close) {
  const t = typeOf(e);
  const u = photoURL(e);
  const kv = h('dl', { class: 'kv' });
  let n = 0;
  for (const f of fieldsOf(t)) {
    const v = e.data[f.key];
    if (!hasVal(v) || f.type === 'textarea') continue;
    kv.append(h('dt', null, f.label), h('dd', null, fmtValue(f, v)));
    if (++n >= 6) break;
  }
  const rels = relationsOf(e.id);
  el.replaceChildren(h('div', { class: 'peek panel cut', style: { '--c': t.color, '--acc': t.color, background: 'var(--panel2)' } },
    h('button', { class: 'ibtn x', onclick: close }, ic('x')),
    h('div', { class: 'hero', style: u ? { 'background-image': `url("${u}")` } : {} }, u ? null : ic(t.icon)),
    h('div', { class: 'body' },
      h('div', { class: 'name' }, e.name),
      h('span', { class: 'tbadge', style: { '--c': t.color } }, ic(t.icon), t.name),
      n ? kv : h('p', { class: 'muted' }, 'Sin datos todavía.'),
      e.tags.length ? h('div', { class: 'tags' }, e.tags.map(x => h('span', { class: 'tag' }, x))) : null,
      rels.length ? h('div', { style: { margin: '12px 0' } },
        h('div', { class: 'kick', style: { 'margin-bottom': '6px' } }, `Conexiones · ${rels.length}`),
        rels.slice(0, 6).map(x => h('div', {
          class: 'bday', onclick: () => {
            const nd = cy.getElementById('n' + x.other.id);
            if (nd.length) { highlight(cy, nd); cy.animate({ center: { eles: nd } }, { duration: 350 }); showPeek(el, x.other, cy, close); }
            else location.hash = '#/e/' + x.other.id;
          }
        }, avatar(x.other), h('div', null, h('div', { style: { 'font-weight': 700 } }, x.other.name),
          h('div', { class: 'muted', style: { 'font-size': '13px' } }, x.out ? x.r.label + ' →' : '← ' + x.r.label))))) : null,
      h('div', { style: { display: 'flex', gap: '8px', 'margin-top': '14px', 'flex-wrap': 'wrap' } },
        h('button', { class: 'btn solid', style: { '--c': t.color }, onclick: () => location.hash = '#/e/' + e.id }, ic('open'), 'Expediente'),
        h('button', { class: 'btn', style: { '--c': t.color }, onclick: () => { const nd = cy.getElementById('n' + e.id); cy.animate({ fit: { eles: nd.closedNeighborhood(), padding: 90 } }, { duration: 450 }); } }, ic('focus'), 'Enfocar')))));
}

/* ================= Vista: LISTA ================= */

function viewList() {
  const flt = JSON.parse(sessionStorage.getItem('nx.flt') || '{"t":0,"tag":""}');
  const grid = h('div', { class: 'grid' });
  const q = h('input', { type: 'search', placeholder: 'Filtrar…', style: { 'max-width': '260px' } });
  const draw = () => {
    sessionStorage.setItem('nx.flt', JSON.stringify(flt));
    const n = norm(q.value);
    const list = S.entities.filter(e => (!flt.t || e.type_id === flt.t) && (!flt.tag || e.tags.includes(flt.tag)) && (!n || norm(e.name + ' ' + e.tags.join(' ') + ' ' + Object.values(e.data).join(' ')).includes(n)));
    grid.replaceChildren(...list.map(card));
    if (!list.length) grid.append(h('div', { class: 'nodata', style: { 'grid-column': '1/-1' } }, S.entities.length ? 'Nada coincide con el filtro.' : 'Aún no hay registros. Usa el botón «Nuevo».'));
    chips.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', +c.dataset.t === flt.t));
    tagsEl.querySelectorAll('.tag').forEach(c => c.classList.toggle('on', c.dataset.tag === flt.tag));
  };
  q.addEventListener('input', draw);
  const chips = h('div', { class: 'filters' },
    h('button', { class: 'chip', dataset: { t: 0 }, onclick: () => { flt.t = 0; draw(); } }, 'Todos', h('span', { class: 'n' }, S.entities.length)),
    S.types.map(t => h('button', { class: 'chip', dataset: { t: t.id }, style: { '--c': t.color }, onclick: () => { flt.t = t.id; draw(); } }, ic(t.icon), t.name, h('span', { class: 'n' }, t.count))),
    h('div', { class: 'sp' }), q);
  const tags = allTags();
  const tagsEl = h('div', { style: { margin: '-8px 0 18px' } }, tags.map(t => h('span', { class: 'tag', dataset: { tag: t }, onclick: () => { flt.tag = flt.tag === t ? '' : t; draw(); } }, t)));
  viewEl.replaceChildren(h('div', { class: 'page' },
    h('div', { style: { display: 'flex', 'align-items': 'end', gap: '12px', 'flex-wrap': 'wrap' } },
      h('div', { style: { flex: 1 } }, h('div', { class: 'kick' }, 'Base de datos'), h('h1', null, 'Registros')),
      h('button', { class: 'btn', onclick: () => importDlg() }, ic('download'), 'Importar contactos')),
    chips, tags.length ? tagsEl : '', grid));
  draw();
}

function card(e) {
  const t = typeOf(e);
  const u = photoURL(e);
  return h('a', { class: 'card cut', href: '#/e/' + e.id, style: { '--c': t.color } },
    h('div', { class: 'img', style: u ? { 'background-image': `url("${u}")` } : {} }, u ? null : ic(t.icon)),
    h('div', { class: 'b' },
      h('span', { class: 'tbadge', style: { '--c': t.color } }, ic(t.icon), t.name),
      h('div', { class: 'nm' }, e.name),
      h('div', { class: 'sub' }, summary(e) || '—')));
}

/* ================= Vista: EXPEDIENTE ================= */

async function viewEntity(id, editing) {
  const e = S.E.get(id);
  if (!e) { viewEl.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'nodata' }, 'Este registro no existe.'))); return; }
  let det;
  try { det = await api('GET', '/api/entities/' + id); } catch (err) { return fail(err); }
  if (location.hash.split('/')[2] != id) return; // el usuario ya navegó a otra parte
  const t = typeOf(e);
  document.documentElement.style.setProperty('--acc', t.color);
  const u = photoURL(e, false);

  const photoInput = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => { if (photoInput.files[0]) { await uploadFiles(e.id, [photoInput.files[0]], true); refresh(); } } });
  const idcard = h('section', { class: 'panel cut idcard', style: { '--c': t.color } },
    h('span', { class: 'corner tl' }), h('span', { class: 'corner br' }),
    h('div', { class: 'photo cut', title: 'Cambiar foto', style: u ? { 'background-image': `url("${photoURL(e)}")` } : {}, onclick: () => photoInput.click() },
      u ? null : ic(t.icon), h('span', { class: 'btn sm solid cam' }, ic('camera'), u ? 'Cambiar' : 'Subir foto')),
    photoInput,
    h('div', { style: { 'margin-top': '14px' } }, h('span', { class: 'tbadge', style: { '--c': t.color } }, ic(t.icon), t.name)),
    h('div', { class: 'nm' }, e.name),
    summary(e) ? h('div', { class: 'muted' }, summary(e)) : null,
    e.tags.length ? h('div', { class: 'tags' }, e.tags.map(x => h('span', { class: 'tag', onclick: () => { sessionStorage.setItem('nx.flt', JSON.stringify({ t: 0, tag: x })); location.hash = '#/lista'; } }, x))) : null,
    h('div', { class: 'acts' },
      h('button', { class: 'btn solid', onclick: () => location.hash = `#/e/${id}/editar` }, ic('edit'), 'Editar'),
      h('button', { class: 'btn mg', onclick: () => deleteEntity(e) }, ic('trash'), 'Borrar')),
    h('div', { class: 'meta' }, `ALTA ${fmtDate(e.created)} · ACTUALIZADO ${fmtDate(e.updated)}`));

  // Conexiones: mini diagrama + lista
  const rels = relationsOf(id);
  const mini = h('div', { id: 'minicy' });
  const mapPanel = rels.length && !editing ? h('section', { class: 'panel cut mappanel' },
    h('span', { class: 'corner tl' }), h('span', { class: 'corner br' }),
    h('div', { class: 'ph' }, h('h2', null, 'Mapa de conexiones'), h('span', { class: 'count' }, 'toca un nodo para navegar')), mini) : null;
  const connPanel = h('section', { class: 'panel cut', style: { '--acc': t.color } },
    h('div', { class: 'ph' }, h('h2', null, 'Conexiones'), h('span', { class: 'count' }, rels.length),
      h('button', { class: 'btn sm', onclick: () => relationDlg(e) }, ic('link'), 'Conectar')),
    rels.length ? null : h('div', { class: 'nodata' }, 'Sin conexiones. Conecta esta ficha con familiares, amigos, vehículos…'),
    h('div', { class: 'rels' }, rels.map(x => h('div', { class: 'rel' },
      avatar(x.other),
      h('div', { class: 'tx' }, x.out
        ? [h('span', { class: 'lb' }, (x.r.label || 'conectado con') + ' '), h('a', { href: '#/e/' + x.other.id }, x.other.name)]
        : [h('a', { href: '#/e/' + x.other.id }, x.other.name), h('span', { class: 'lb' }, ' ' + (x.r.label || 'conectado con'))]),
      h('button', { class: 'ibtn', title: 'Editar', onclick: () => relationDlg(e, x.r) }, ic('edit')),
      h('button', { class: 'ibtn danger', title: 'Quitar', onclick: async () => { if (await confirmDlg('Quitar conexión', `¿Quitar la conexión entre ${e.name} y ${x.other.name}?`, 'Quitar')) { try { await api('DELETE', '/api/relations/' + x.r.id); refresh(); } catch (er) { fail(er); } } } }, ic('trash'))))));

  const main = h('div', { class: 'dmain' }, mapPanel);
  viewEl.replaceChildren(h('div', { class: 'page' },
    h('div', { class: 'kick', style: { 'margin-bottom': '14px' } }, h('a', { href: '#/lista' }, 'Registros'), ' / ', t.name, ' / ', h('span', { style: { color: t.color } }, `#${String(e.id).padStart(4, '0')}`)),
    h('div', { class: 'dossier' }, h('aside', null, idcard, connPanel), main)));

  if (editing) main.append(editForm(e));
  else main.append(dossierTabs(e, det));

  if (mapPanel) {
    const near = new Set(rels.map(x => x.other.id));
    const far = new Set();
    S.relations.forEach(r => {
      if (near.has(r.from_id) && r.to_id !== id && !near.has(r.to_id)) far.add(r.to_id);
      if (near.has(r.to_id) && r.from_id !== id && !near.has(r.from_id)) far.add(r.from_id);
    });
    const ents = [e, ...[...near].map(i => S.E.get(i)), ...[...far].slice(0, 30).map(i => S.E.get(i))].filter(Boolean);
    const set = new Set(ents.map(x => x.id));
    const els = [
      ...ents.map(x => { const nd = nodeOf(x); nd.classes = x.id === id ? 'root' : far.has(x.id) ? 'far' : ''; return nd; }),
      ...S.relations.filter(r => set.has(r.from_id) && set.has(r.to_id)).map(edgeOf),
    ];
    const cy = makeCy(mini, els);
    runLayout(cy, { name: 'concentric', concentric: n => n.hasClass('root') ? 3 : n.hasClass('far') ? 1 : 2, levelWidth: () => 1, minNodeSpacing: 26, padding: 24, animate: true, animationDuration: 500 });
    cy.userZoomingEnabled(false);
    cy.on('tap', 'node', ev => { const eid = ev.target.data('eid'); if (eid !== id) location.hash = '#/e/' + eid; });
    cy.on('mouseover', 'node', ev => { highlight(cy, ev.target); mini.style.cursor = 'pointer'; });
    cy.on('mouseout', 'node', () => { clearHighlight(cy); mini.style.cursor = ''; });
  }
}

function dossierTabs(e, det) {
  const t = typeOf(e);
  const known = new Set(fieldsOf(t).map(f => f.key));
  const extra = Object.entries(e.data).filter(([k, v]) => !known.has(k) && hasVal(v));
  const tabs = [
    ...t.schema.sections.map(s => ({ id: 's:' + s.id, label: s.label, n: (s.fields || []).filter(f => hasVal(e.data[f.key])).length, render: () => sectionView(e, s) })),
    ...(extra.length ? [{ id: 'extra', label: 'Otros datos', n: extra.length, render: () => extraView(extra) }] : []),
    { id: 'timeline', label: 'Línea de tiempo', n: det.events.length, render: () => timelineView(e, det.events) },
    { id: 'files', label: 'Archivos', n: det.files.length, render: () => filesView(e, det.files) },
  ];
  const key = 'nx.tab';
  let cur = sessionStorage.getItem(key);
  if (!tabs.find(x => x.id === cur)) cur = tabs[0].id;
  const body = h('div');
  const bar = h('div', { class: 'tabs' }, tabs.map(x => h('button', { class: 'tab', dataset: { id: x.id }, onclick: () => show(x.id) }, x.label, h('span', { class: 'n' }, x.n))));
  const show = idv => {
    cur = idv; sessionStorage.setItem(key, idv);
    bar.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.id === idv));
    body.replaceChildren(tabs.find(x => x.id === idv).render());
  };
  show(cur);
  return h('section', { class: 'panel cut' }, h('span', { class: 'corner tl' }), h('span', { class: 'corner br' }), bar, body);
}

const ALERT_KEYS = new Set(['alergias', 'padecimientos', 'tipo_sangre']);
function sectionView(e, s) {
  const fl = (s.fields || []).filter(f => hasVal(e.data[f.key]));
  if (!fl.length) return h('div', { class: 'nodata' }, 'Sin datos en esta sección. ',
    h('a', { href: `#/e/${e.id}/editar` }, 'Agregar información'));
  return h('div', { class: 'fields' }, fl.map(f => h('div', { class: 'fld' + (f.type === 'textarea' ? ' wide' : '') + (ALERT_KEYS.has(f.key) ? ' alert' : '') },
    h('div', { class: 'k' }, f.label), h('div', { class: 'v' }, fmtValue(f, e.data[f.key])))));
}

function extraView(extra) {
  return h('div', null,
    h('p', { class: 'hint', style: { 'margin-bottom': '12px' } }, 'Datos de campos que ya no existen en el tipo de registro. Se conservan por seguridad.'),
    h('div', { class: 'fields' }, extra.map(([k, v]) => h('div', { class: 'fld' }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, String(v))))));
}

/* ---------- edición ---------- */

function fieldInput(f, v) {
  const p = { name: f.key };
  switch (f.type) {
    case 'textarea': return h('textarea', { ...p, value: v ?? '' });
    case 'number': return h('input', { ...p, type: 'number', step: 'any', value: v ?? '' });
    case 'date': return h('input', { ...p, type: 'date', value: v ?? '' });
    case 'phone': return h('input', { ...p, type: 'tel', value: v ?? '' });
    case 'email': return h('input', { ...p, type: 'email', value: v ?? '' });
    case 'url': return h('input', { ...p, type: 'text', inputmode: 'url', value: v ?? '' });
    case 'checkbox': return h('input', { ...p, type: 'checkbox', checked: !!v });
    case 'select': {
      const opts = [...(f.options || [])];
      if (hasVal(v) && !opts.includes(v)) opts.push(v);
      return h('select', { ...p, value: v ?? '' }, h('option', { value: '' }, '—'), opts.map(o => h('option', { value: o }, o)));
    }
    default: return h('input', { ...p, type: 'text', value: v ?? '' });
  }
}

function tagsInput(cur) {
  const input = h('input', { type: 'text', value: cur.join(', '), placeholder: 'familia, trabajo, escuela…' });
  const sugg = allTags().filter(t => !cur.includes(t));
  const wrap = h('label', { class: 'f wide' }, h('span', null, 'Etiquetas (separadas por coma)'), input,
    sugg.length ? h('div', null, sugg.map(t => h('span', { class: 'tag', onclick: () => { const v = input.value.trim(); input.value = v ? (v.replace(/,\s*$/, '') + ', ' + t) : t; } }, '+ ' + t))) : null);
  wrap.read = () => [...new Set(input.value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean))];
  return wrap;
}

function editForm(e) {
  const t = typeOf(e);
  const name = h('input', { type: 'text', value: e.name, required: true });
  const type = h('select', { value: String(e.type_id) }, S.types.map(x => h('option', { value: String(x.id) }, x.name)));
  type.value = String(e.type_id);
  const tags = tagsInput(e.tags);
  const inputs = [];
  const form = h('form', {
    class: 'form', onsubmit: async ev => {
      ev.preventDefault();
      const data = { ...e.data };
      inputs.forEach(({ f, el }) => {
        let v = f.type === 'checkbox' ? el.checked : el.value.trim();
        if (f.type === 'number' && v !== '') v = Number(v);
        if (hasVal(v)) data[f.key] = v; else delete data[f.key];
      });
      try {
        await api('PUT', '/api/entities/' + e.id, { type_id: +type.value, name: name.value, tags: tags.read(), data });
        toast('Guardado');
        await loadAll();
        location.hash = '#/e/' + e.id;
      } catch (er) { fail(er); }
    }
  },
    h('label', { class: 'f wide' }, h('span', null, 'Nombre'), name),
    h('label', { class: 'f' }, h('span', null, 'Tipo de registro'), type),
    tags,
    t.schema.sections.map(s => [
      h('div', { class: 'sec-title' }, h('h2', null, s.label)),
      (s.fields || []).map(f => {
        const el = fieldInput(f, e.data[f.key]);
        inputs.push({ f, el });
        return f.type === 'checkbox'
          ? h('label', { class: 'f chk' }, el, h('span', null, f.label))
          : h('label', { class: 'f' + (f.type === 'textarea' ? ' wide' : '') }, h('span', null, f.label), el);
      })]),
    h('div', { class: 'wide hint' }, '¿Te falta un campo? Agrégalo en ', h('a', { href: '#/tipo/' + t.id }, `Sistema → ${t.name}`), '.'),
    h('div', { class: 'formbar wide' },
      h('button', { class: 'btn mut', type: 'button', onclick: () => location.hash = '#/e/' + e.id }, 'Cancelar'),
      h('button', { class: 'btn solid', type: 'submit' }, 'Guardar')));
  return h('section', { class: 'panel cut' }, h('span', { class: 'corner tl' }), h('span', { class: 'corner br' }),
    h('div', { class: 'ph' }, h('h2', null, 'Editar expediente')), form);
}

async function deleteEntity(e) {
  if (!await confirmDlg('Mover a la papelera', `«${e.name}» se moverá a la papelera con sus notas, archivos y conexiones. Puedes restaurarlo desde Depurador → Papelera.`, 'Mover a papelera')) return;
  try { await api('DELETE', '/api/entities/' + e.id); toast('Movido a la papelera'); await loadAll(); location.hash = '#/lista'; } catch (er) { fail(er); }
}

/* ---------- línea de tiempo ---------- */

const KINDS = ['nota', 'evento', 'cita médica', 'llamada', 'regalo', 'viaje', 'logro', 'otro'];

function eventForm(ev, onSave) {
  const date = h('input', { type: 'date', value: ev.date || today() });
  const kind = h('input', { type: 'text', value: ev.kind || 'nota', list: 'nx-kinds' });
  const title = h('input', { type: 'text', value: ev.title || '', placeholder: 'Título' });
  const body = h('textarea', { value: ev.body || '', placeholder: 'Detalles…' });
  return h('form', { class: 'form', onsubmit: e => { e.preventDefault(); onSave({ date: date.value, kind: kind.value.trim() || 'nota', title: title.value.trim(), body: body.value.trim() }); } },
    h('datalist', { id: 'nx-kinds' }, KINDS.map(k => h('option', { value: k }))),
    h('label', { class: 'f' }, h('span', null, 'Fecha'), date),
    h('label', { class: 'f' }, h('span', null, 'Tipo'), kind),
    h('label', { class: 'f wide' }, h('span', null, 'Título'), title),
    h('label', { class: 'f wide' }, h('span', null, 'Descripción'), body),
    h('div', { class: 'wide', style: { display: 'flex', 'justify-content': 'flex-end', gap: '10px' } }, h('button', { class: 'btn solid', type: 'submit' }, 'Guardar')));
}

function timelineView(e, events) {
  const add = () => {
    const close = modal('Nuevo registro en la línea de tiempo', eventForm({}, async v => {
      try { await api('POST', `/api/entities/${e.id}/events`, v); close(); toast('Agregado'); route(); } catch (er) { fail(er); }
    }));
  };
  return h('div', null,
    h('div', { style: { display: 'flex', 'justify-content': 'space-between', 'align-items': 'center', gap: '10px' } },
      h('span', { class: 'muted' }, 'Notas, citas, regalos, viajes y momentos importantes.'),
      h('button', { class: 'btn sm solid', onclick: add }, ic('plus'), 'Agregar')),
    events.length ? h('div', { class: 'tl' }, events.map(ev => h('div', { class: 'ev cut' },
      h('div', { class: 'h' },
        h('span', { class: 'dt' }, fmtDate(ev.date) || 'SIN FECHA'), h('span', { class: 'kd' }, ev.kind),
        h('span', { class: 'tt' }, ev.title),
        h('button', {
          class: 'ibtn', title: 'Editar', onclick: () => {
            const close = modal('Editar', eventForm(ev, async v => { try { await api('PUT', '/api/events/' + ev.id, v); close(); route(); } catch (er) { fail(er); } }));
          }
        }, ic('edit')),
        h('button', { class: 'ibtn danger', title: 'Borrar', onclick: async () => { if (await confirmDlg('Borrar', '¿Borrar este registro de la línea de tiempo?')) { try { await api('DELETE', '/api/events/' + ev.id); route(); } catch (er) { fail(er); } } } }, ic('trash'))),
      ev.body ? h('div', { class: 'bd' }, ev.body) : null)))
      : h('div', { class: 'nodata', style: { 'margin-top': '16px' } }, 'Todavía no hay nada en la línea de tiempo.'));
}

/* ---------- archivos ---------- */

async function makeThumb(file) {
  if (!file.type.startsWith('image/')) return null;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 480 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close && bmp.close();
    return await new Promise(r => c.toBlob(r, 'image/jpeg', .85));
  } catch { return null; }
}

async function uploadFiles(eid, files, asPhoto = false) {
  let ok = 0;
  for (const f of files) {
    toast(`Subiendo ${f.name}…`);
    const fd = new FormData();
    fd.append('file', f, f.name);
    const th = await makeThumb(f);
    if (th) fd.append('thumb', th, 'thumb.jpg');
    if (asPhoto) fd.append('foto', '1');
    try { await api('POST', `/api/entities/${eid}/files`, fd); ok++; } catch (er) { fail(er); }
  }
  if (ok) toast(ok === 1 ? 'Archivo guardado' : `${ok} archivos guardados`);
}

function filesView(e, files) {
  const input = h('input', { type: 'file', multiple: true, hidden: true, onchange: async () => { await uploadFiles(e.id, [...input.files]); refresh(); } });
  const drop = h('div', {
    class: 'drop', onclick: () => input.click(),
    ondragover: ev => { ev.preventDefault(); drop.classList.add('over'); },
    ondragleave: () => drop.classList.remove('over'),
    ondrop: async ev => { ev.preventDefault(); drop.classList.remove('over'); if (ev.dataTransfer.files.length) { await uploadFiles(e.id, [...ev.dataTransfer.files]); refresh(); } },
  }, ic('download'), h('div', { style: { 'font-weight': 700, 'margin-top': '6px' } }, 'Arrastra fotos o documentos aquí, o toca para elegir'),
    h('div', { class: 'hint' }, 'Fotos, INE, tarjeta de circulación, recetas, estudios médicos, PDF…'));
  const imgs = files.filter(f => f.mime.startsWith('image/') || f.mime.startsWith('video/'));
  const docs = files.filter(f => !imgs.includes(f));
  return h('div', null, drop, input,
    imgs.length ? h('div', { class: 'gallery' }, imgs.map(f => h('div', {
      class: 'thumb' + (f.id === e.photo_id ? ' isphoto' : ''), title: f.name,
      style: f.mime.startsWith('image/') ? { 'background-image': `url("/files/${f.id}/thumb")` } : {},
      onclick: () => lightbox(e, f),
    }, f.mime.startsWith('video/') ? h('div', { style: { display: 'grid', 'place-items': 'center', height: '100%', color: 'var(--acc)' } }, ic('camera')) : null))) : null,
    docs.length ? h('div', { class: 'docs' }, docs.map(f => h('div', { class: 'doc' },
      ic('file'), h('a', { class: 'nm', href: '/files/' + f.id, target: '_blank', rel: 'noopener' }, f.name),
      h('span', { class: 'sz' }, fmtSize(f.size)),
      h('a', { class: 'ibtn', href: '/files/' + f.id, download: f.name, title: 'Descargar' }, ic('download')),
      h('button', { class: 'ibtn danger', title: 'Borrar', onclick: () => delFile(f) }, ic('trash'))))) : null);
}

async function delFile(f) {
  if (!await confirmDlg('Borrar archivo', `¿Borrar «${f.name}»?`)) return false;
  try { await api('DELETE', '/api/files/' + f.id); toast('Archivo borrado'); await refresh(); return true; } catch (er) { fail(er); return false; }
}

function lightbox(e, f) {
  const media = f.mime.startsWith('video/') ? h('video', { src: '/files/' + f.id, controls: true }) : h('img', { src: '/files/' + f.id, alt: f.name });
  const close = modal(f.name, h('div', { class: 'lightbox' }, media,
    h('div', { class: 'acts' },
      h('span', { class: 'muted', style: { 'margin-right': 'auto' } }, `${fmtSize(f.size)} · ${fmtDate(f.created)}`),
      f.mime.startsWith('image/') && f.id !== e.photo_id ? h('button', { class: 'btn', onclick: async () => { try { await api('PUT', `/api/entities/${e.id}/photo`, { file_id: f.id }); close(); toast('Foto de perfil actualizada'); refresh(); } catch (er) { fail(er); } } }, ic('camera'), 'Usar como foto') : null,
      h('a', { class: 'btn', href: '/files/' + f.id, download: f.name }, ic('download'), 'Descargar'),
      h('button', { class: 'btn mg', onclick: async () => { close(); await delFile(f); } }, ic('trash'), 'Borrar'))), { wide: true });
}

/* ---------- conexiones ---------- */

const REL_SUGG = ['es padre de', 'es madre de', 'es hijo(a) de', 'es pareja de', 'es esposo(a) de', 'es hermano(a) de', 'es abuelo(a) de', 'es nieto(a) de', 'es tío(a) de', 'es sobrino(a) de', 'es primo(a) de', 'es amigo(a) de', 'trabaja con', 'vive con', 'es dueño(a) de', 'maneja', 'es mascota de', 'es compadre / comadre de'];

function relationDlg(e, rel) {
  let other = rel ? S.E.get(rel.from_id === e.id ? rel.to_id : rel.from_id) : null;
  let out = rel ? rel.from_id === e.id : true;
  const label = h('input', { type: 'text', list: 'nx-rels', value: rel ? rel.label : '', placeholder: 'es hermano(a) de, maneja…', oninput: () => drawSentence() });
  const q = h('input', { type: 'search', placeholder: 'Buscar o escribir un nombre nuevo…', autocomplete: 'off', oninput: () => drawPick() });
  const pick = h('div');
  const sentence = h('div', { class: 'sentence' });
  const newType = h('select', null, S.types.map(t => h('option', { value: String(t.id) }, t.name)));

  const drawSentence = () => {
    const a = h('b', null, e.name), b = h('b', null, other ? other.name : '¿?');
    const l = h('i', null, ' ' + (label.value.trim() || 'conectado con') + ' ');
    sentence.replaceChildren(...(out ? [a, l, b] : [b, l, a]));
  };
  const drawPick = () => {
    if (other) {
      pick.replaceChildren(h('div', { class: 'res', style: { border: '1px solid var(--line2)' } }, avatar(other), h('div', { style: { flex: 1 } }, h('div', { class: 't' }, other.name), h('div', { class: 's' }, typeOf(other).name)),
        h('button', { class: 'ibtn', title: 'Cambiar', type: 'button', onclick: () => { other = null; drawPick(); drawSentence(); q.focus(); } }, ic('x'))));
      return;
    }
    const n = norm(q.value.trim());
    const linked = new Set(relationsOf(e.id).map(x => x.other.id));
    const list = S.entities.filter(x => x.id !== e.id && (!n || norm(x.name).includes(n))).sort((a, b) => linked.has(a.id) - linked.has(b.id)).slice(0, 30);
    pick.replaceChildren(q, h('div', { class: 'picklist' },
      list.map(x => h('div', { class: 'res', onclick: () => { other = x; drawPick(); drawSentence(); label.focus(); } }, avatar(x), h('div', null, h('div', { class: 't' }, x.name), h('div', { class: 's' }, typeOf(x).name + (linked.has(x.id) ? ' · ya conectado' : ''))))),
      q.value.trim() && !S.entities.some(x => norm(x.name) === n) ? h('div', { class: 'res', style: { gap: '8px', 'flex-wrap': 'wrap' } },
        h('span', null, 'Crear '), h('b', null, `«${q.value.trim()}»`), h('span', null, ' como '), (newType.style.width = 'auto', newType),
        h('button', {
          class: 'btn sm solid', type: 'button', onclick: async () => {
            try {
              const r = await api('POST', '/api/entities', { type_id: +newType.value, name: q.value.trim(), tags: [], data: {} });
              await loadAll(); other = S.E.get(r.id); drawPick(); drawSentence(); label.focus();
            } catch (er) { fail(er); }
          }
        }, 'Crear')) : null,
      !list.length && !q.value.trim() ? h('div', { class: 'empty-res' }, 'No hay otros registros todavía.') : null));
  };

  const close = modal(rel ? 'Editar conexión' : 'Nueva conexión', h('div', null,
    h('datalist', { id: 'nx-rels' }, REL_SUGG.map(s => h('option', { value: s }))),
    h('label', { class: 'f' }, h('span', null, 'Conectar con')), pick,
    h('label', { class: 'f', style: { 'margin-top': '14px' } }, h('span', null, 'Relación'), label),
    sentence,
    h('div', { style: { 'text-align': 'center' } }, h('button', { class: 'btn sm mut', type: 'button', onclick: () => { out = !out; drawSentence(); } }, ic('swap'), 'Invertir dirección')),
    h('div', { class: 'acts' },
      h('button', { class: 'btn mut', onclick: () => close() }, 'Cancelar'),
      h('button', {
        class: 'btn solid', onclick: async () => {
          if (!other) return toast('Elige con quién conectar', true);
          const body = { from_id: out ? e.id : other.id, to_id: out ? other.id : e.id, label: label.value.trim() };
          try { await api(rel ? 'PUT' : 'POST', '/api/relations' + (rel ? '/' + rel.id : ''), body); close(); toast('Conexión guardada'); refresh(); } catch (er) { fail(er); }
        }
      }, 'Guardar'))));
  drawPick(); drawSentence();
}

/* ---------- nuevo registro ---------- */

function newEntityDlg() {
  if (!S.types.length) { location.hash = '#/tipo/nuevo'; return; }
  let sel = S.types[0].id;
  const name = h('input', { type: 'text', placeholder: 'Nombre completo', required: true });
  const picks = h('div', { class: 'typepick' }, S.types.map(t => h('button', {
    type: 'button', class: 'tpick' + (t.id === sel ? ' on' : ''), style: { '--c': t.color }, dataset: { id: t.id },
    onclick: ev => { sel = t.id; picks.querySelectorAll('.tpick').forEach(b => b.classList.toggle('on', +b.dataset.id === sel)); name.focus(); }
  }, ic(t.icon), t.name)));
  const close = modal('Nuevo registro', h('form', {
    onsubmit: async ev => {
      ev.preventDefault();
      try {
        const r = await api('POST', '/api/entities', { type_id: sel, name: name.value, tags: [], data: {} });
        close(); await loadAll(); location.hash = `#/e/${r.id}/editar`;
      } catch (er) { fail(er); }
    }
  }, picks, h('label', { class: 'f' }, h('span', null, 'Nombre'), name),
    h('div', { class: 'acts' }, h('button', { class: 'btn solid', type: 'submit' }, 'Crear y completar'))));
}

/* ================= Vista: SISTEMA ================= */

async function viewSettings() {
  let info = {};
  try { info = await api('GET', '/api/info'); } catch (er) { fail(er); }

  const pwA = h('input', { type: 'password', autocomplete: 'current-password' });
  const pwB = h('input', { type: 'password', autocomplete: 'new-password' });
  const bk1 = h('input', { type: 'password', autocomplete: 'new-password' });
  const bk2 = h('input', { type: 'password', autocomplete: 'new-password' });
  const bkBtn = h('button', {
    class: 'btn solid', onclick: async () => {
      if (bk1.value.length < 6) return toast('Usa al menos 6 caracteres', true);
      if (bk1.value !== bk2.value) return toast('Las contraseñas no coinciden', true);
      bkBtn.disabled = true; toast('Generando respaldo…');
      try {
        const r = await api('POST', '/api/backup', { password: bk1.value });
        const blob = await r.blob();
        const name = (/filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '') || [])[1] || 'nexus.nexus';
        const a = h('a', { href: URL.createObjectURL(blob), download: name });
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        toast(`Respaldo listo (${fmtSize(blob.size)})`);
        bk1.value = bk2.value = '';
      } catch (er) { fail(er); }
      bkBtn.disabled = false;
    }
  }, ic('download'), 'Descargar respaldo cifrado');

  const urls = info.urls || [];
  viewEl.replaceChildren(h('div', { class: 'page' },
    h('div', { class: 'kick' }, 'Configuración'), h('h1', null, 'Sistema'),
    h('div', { class: 'cfg' },
      h('section', { class: 'panel cut full' }, h('span', { class: 'corner tl' }), h('span', { class: 'corner br' }),
        h('div', { class: 'ph' }, h('h2', null, 'Tipos de registro y campos')),
        h('p', { class: 'muted', style: { 'margin-top': 0 } }, 'Define qué información guardas. Agrega campos nuevos cuando quieras, o crea tipos nuevos (por ejemplo: Lugares, Empresas, Médicos).'),
        h('div', { class: 'typecards' },
          S.types.map(t => h('button', { class: 'tcard', style: { '--c': t.color }, onclick: () => location.hash = '#/tipo/' + t.id },
            ic(t.icon), h('div', null, h('div', { class: 'nm' }, t.name), h('div', { class: 's' }, `${fieldsOf(t).length} campos · ${t.count} registros`)))),
          h('button', { class: 'tcard add', onclick: () => location.hash = '#/tipo/nuevo' }, ic('plus'), h('span', { class: 'nm' }, 'Nuevo tipo')))),

      h('section', { class: 'panel cut full' },
        h('div', { class: 'ph' }, h('h2', null, 'Importar contactos'), h('button', { class: 'btn sm solid', onclick: () => importDlg() }, ic('download'), 'Importar')),
        h('p', { class: 'muted', style: { margin: 0 } }, 'Trae tus contactos de Google Contactos, iPhone u Outlook (archivo .vcf o .csv), con fotos, cumpleaños y etiquetas. Detecta duplicados.')),

      h('section', { class: 'panel cut' },
        h('div', { class: 'ph' }, h('h2', null, 'Acceso desde el celular')),
        info.red_local ? (urls.length ? h('div', null,
          h('p', { class: 'muted', style: { 'margin-top': 0 } }, 'Con el celular conectado al mismo Wi-Fi, escanea el código o abre:'),
          urls.map(u => h('div', { class: 'qr' }, h('img', { src: '/api/qr?text=' + encodeURIComponent(u), alt: 'Código QR' }), h('div', { class: 'url' }, u))),
          h('ol', { class: 'steps' },
            h('li', null, 'La primera vez, Windows preguntará si permites el acceso: elige «Redes privadas».'),
            h('li', null, 'La red de la PC (Wi-Fi o cable Ethernet) debe estar marcada como «Privada» en Windows: Configuración → Red e Internet → Ethernet/Wi-Fi → Tipo de perfil de red.'),
            h('li', null, 'El celular debe estar en el Wi-Fi del mismo módem que la PC, no en la red de invitados.'),
            h('li', null, 'La PC debe estar encendida con NEXUS abierto.'),
            h('li', null, 'Tip: en el celular usa «Agregar a pantalla de inicio» para tenerlo como app.')))
          : h('p', { class: 'muted' }, 'No se detectó una red local. Conecta la PC a tu Wi-Fi o cable de red y recarga esta página.'))
          : h('p', { class: 'muted' }, 'El acceso por red está desactivado. Para activarlo, cambia "red_local" a true en datos/config.json y reinicia NEXUS.')),

      h('section', { class: 'panel cut' },
        h('div', { class: 'ph' }, h('h2', null, 'Respaldo')),
        h('p', { class: 'muted', style: { 'margin-top': 0 } }, 'Descarga un archivo .nexus cifrado con todo: datos, fotos y documentos. Guárdalo en una USB o en otra ubicación.'),
        h('div', { class: 'form' },
          h('label', { class: 'f' }, h('span', null, 'Contraseña del respaldo'), bk1),
          h('label', { class: 'f' }, h('span', null, 'Repetir'), bk2)),
        h('div', { style: { margin: '14px 0' } }, bkBtn),
        h('p', { class: 'hint' }, 'Para restaurar: cierra NEXUS y arrastra el archivo .nexus sobre nexus.exe. Además, NEXUS guarda sola una copia diaria de la base en datos/respaldos/auto.')),

      h('section', { class: 'panel cut' },
        h('div', { class: 'ph' }, h('h2', null, 'Seguridad')),
        h('div', { class: 'form' },
          h('label', { class: 'f' }, h('span', null, 'Contraseña actual'), pwA),
          h('label', { class: 'f' }, h('span', null, 'Nueva contraseña'), pwB)),
        h('div', { style: { display: 'flex', gap: '10px', 'margin-top': '14px', 'flex-wrap': 'wrap' } },
          h('button', {
            class: 'btn', onclick: async () => {
              try { await api('POST', '/api/password', { actual: pwA.value, nueva: pwB.value }); pwA.value = pwB.value = ''; toast('Contraseña actualizada. Los demás dispositivos deberán entrar de nuevo.'); } catch (er) { fail(er); }
            }
          }, ic('shield'), 'Cambiar contraseña'),
          h('button', { class: 'btn mg', onclick: async () => { try { await api('POST', '/api/logout'); } catch { } showGate(false); } }, ic('logout'), 'Cerrar sesión'))),

      h('section', { class: 'panel cut' },
        h('div', { class: 'ph' }, h('h2', null, 'Información')),
        h('dl', { class: 'kv' },
          h('dt', null, 'Versión'), h('dd', null, info.version || '—'),
          h('dt', null, 'Carpeta de datos'), h('dd', null, info.data_dir || '—'),
          h('dt', null, 'Tamaño'), h('dd', null, info.size != null ? fmtSize(info.size) : '—'),
          h('dt', null, 'Registros'), h('dd', null, `${S.entities.length} · ${S.relations.length} conexiones`)),
        h('p', { class: 'hint' }, 'Para cambiar de computadora copia toda la carpeta de NEXUS (nexus.exe + datos). Consejo: guárdala dentro de una unidad cifrada con BitLocker o VeraCrypt.')))));
}

/* ---------- editor de tipos ---------- */

const FIELD_TYPES = [['text', 'Texto corto'], ['textarea', 'Texto largo'], ['number', 'Número'], ['date', 'Fecha'], ['select', 'Lista de opciones'], ['phone', 'Teléfono'], ['email', 'Correo'], ['url', 'Enlace'], ['checkbox', 'Sí / No']];
const SHAPES = [['ellipse', 'Círculo'], ['round-rectangle', 'Rectángulo'], ['hexagon', 'Hexágono'], ['diamond', 'Rombo'], ['octagon', 'Octágono'], ['round-triangle', 'Triángulo'], ['star', 'Estrella']];

function viewTypeEditor(id) {
  const src = id ? S.T.get(id) : null;
  if (id && !src) { location.hash = '#/ajustes'; return; }
  const d = src ? JSON.parse(JSON.stringify(src)) : { name: '', color: '#2bff88', icon: 'star', shape: 'ellipse', schema: { sections: [{ id: 'general', label: 'General', fields: [] }] } };
  const move = (arr, i, k) => { const j = i + k; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; draw(); };
  const wrap = h('div', { class: 'page' });

  const draw = () => {
    document.documentElement.style.setProperty('--acc', d.color);
    const secs = d.schema.sections.map((s, si) => h('div', { class: 'secbox cut' },
      h('div', { class: 'sechead' },
        h('input', { type: 'text', value: s.label, placeholder: 'Nombre de la sección', oninput: ev => { s.label = ev.target.value; } }),
        h('button', { class: 'ibtn', title: 'Subir', onclick: () => move(d.schema.sections, si, -1) }, ic('up')),
        h('button', { class: 'ibtn', title: 'Bajar', onclick: () => move(d.schema.sections, si, 1) }, ic('down')),
        h('button', { class: 'ibtn danger', title: 'Quitar sección', onclick: () => { if (!s.fields.length || confirm('¿Quitar la sección «' + s.label + '» y sus campos? Los datos ya capturados se conservan en «Otros datos».')) { d.schema.sections.splice(si, 1); draw(); } } }, ic('trash'))),
      (s.fields = s.fields || []).map((f, fi) => h('div', { class: 'frow' },
        h('input', { type: 'text', value: f.label, placeholder: 'Nombre del campo', oninput: ev => { f.label = ev.target.value; } }),
        h('select', { value: f.type, onchange: ev => { f.type = ev.target.value; draw(); } }, FIELD_TYPES.map(([v, l]) => h('option', { value: v }, l))),
        f.type === 'select'
          ? h('input', { class: 'opt', type: 'text', value: (f.options || []).join(', '), placeholder: 'Opciones separadas por coma', oninput: ev => { f.options = ev.target.value.split(',').map(x => x.trim()).filter(Boolean); } })
          : h('span', { class: 'opt' }),
        h('div', { class: 'btns' },
          h('button', { class: 'ibtn', title: 'Subir', onclick: () => move(s.fields, fi, -1) }, ic('up')),
          h('button', { class: 'ibtn', title: 'Bajar', onclick: () => move(s.fields, fi, 1) }, ic('down')),
          h('button', { class: 'ibtn danger', title: 'Quitar campo', onclick: () => { s.fields.splice(fi, 1); draw(); } }, ic('trash'))),
        f.key ? h('div', { class: 'key' }, 'clave interna: ' + f.key) : null)),
      h('button', { class: 'btn sm', style: { 'margin-top': '12px' }, onclick: () => { s.fields.push({ key: '', label: '', type: 'text' }); draw(); wrap.querySelectorAll('.secbox')[si].querySelector('.frow:last-of-type input').focus(); } }, ic('plus'), 'Campo')));

    wrap.replaceChildren(
      h('div', { class: 'kick' }, h('a', { href: '#/ajustes' }, 'Sistema'), ' / Tipo de registro'),
      h('h1', null, src ? 'Editar: ' + src.name : 'Nuevo tipo de registro'),
      h('div', { class: 'cfg' },
        h('section', { class: 'panel cut' },
          h('div', { class: 'ph' }, h('h2', null, 'Apariencia')),
          h('div', { class: 'form' },
            h('label', { class: 'f' }, h('span', null, 'Nombre'), h('input', { type: 'text', value: d.name, placeholder: 'Ej. Lugar, Empresa, Médico', oninput: ev => { d.name = ev.target.value; } })),
            h('label', { class: 'f' }, h('span', null, 'Color'), h('input', { type: 'color', value: d.color, oninput: ev => { d.color = ev.target.value; document.documentElement.style.setProperty('--acc', d.color); prev(); } })),
            h('label', { class: 'f' }, h('span', null, 'Forma en el diagrama'), h('select', { value: d.shape, onchange: ev => { d.shape = ev.target.value; } }, SHAPES.map(([v, l]) => h('option', { value: v }, l)))),
            h('label', { class: 'f wide' }, h('span', null, 'Icono'), h('div', { class: 'iconpick' }, ENTITY_ICONS.map(n => h('button', { type: 'button', class: n === d.icon ? 'on' : '', onclick: () => { d.icon = n; draw(); } }, ic(n))))))),
        h('section', { class: 'panel cut' },
          h('div', { class: 'ph' }, h('h2', null, 'Vista previa')),
          h('div', { id: 'tprev', style: { display: 'flex', 'align-items': 'center', gap: '16px' } }),
          h('p', { class: 'hint' }, 'Quitar un campo no borra lo que ya capturaste: esos datos quedan visibles en la pestaña «Otros datos» del expediente.')),
        h('section', { class: 'panel cut full' },
          h('div', { class: 'ph' }, h('h2', null, 'Secciones y campos')),
          secs,
          h('button', { class: 'btn', onclick: () => { d.schema.sections.push({ id: '', label: 'Nueva sección', fields: [] }); draw(); } }, ic('plus'), 'Sección'))),
      h('div', { class: 'formbar' },
        src ? h('button', { class: 'btn mg', style: { 'margin-right': 'auto' }, onclick: delType }, ic('trash'), 'Borrar tipo') : null,
        h('button', { class: 'btn mut', onclick: () => location.hash = '#/ajustes' }, 'Cancelar'),
        h('button', { class: 'btn solid', onclick: save }, 'Guardar')));
    prev();
  };
  const prev = () => {
    const el = $('#tprev', wrap); if (!el) return;
    el.replaceChildren(h('div', { class: 'av lg' + (d.shape === 'ellipse' ? ' round' : ''), style: { '--c': d.color, width: '64px', height: '64px' } }, ic(d.icon)),
      h('span', { class: 'tbadge', style: { '--c': d.color } }, ic(d.icon), d.name || 'Tipo'));
  };
  const save = async () => {
    if (!d.name.trim()) return toast('Ponle nombre al tipo', true);
    const usedS = new Set(), usedF = new Set();
    d.schema.sections.forEach(s => s.fields.forEach(f => f.key && usedF.add(f.key)));
    for (const s of d.schema.sections) {
      if (!s.label.trim()) return toast('Hay una sección sin nombre', true);
      if (!s.id) { let k = slug(s.label), b = k, i = 2; while (usedS.has(k) || d.schema.sections.some(x => x !== s && x.id === k)) k = b + '_' + i++; s.id = k; }
      usedS.add(s.id);
      for (const f of s.fields) {
        if (!f.label.trim()) return toast(`Hay un campo sin nombre en «${s.label}»`, true);
        if (!f.key) { let k = slug(f.label), b = k, i = 2; while (usedF.has(k)) k = b + '_' + i++; f.key = k; usedF.add(k); }
        if (f.type !== 'select') delete f.options;
      }
    }
    const body = { name: d.name.trim(), color: d.color, icon: d.icon, shape: d.shape, schema: d.schema };
    try {
      await api(src ? 'PUT' : 'POST', '/api/types' + (src ? '/' + src.id : ''), body);
      toast('Tipo guardado'); await loadAll(); location.hash = '#/ajustes';
    } catch (er) { fail(er); }
  };
  const delType = async () => {
    if (src.count) return toast(`No se puede borrar: hay ${src.count} registros de este tipo`, true);
    if (!await confirmDlg('Borrar tipo', `¿Borrar el tipo «${src.name}»?`)) return;
    try { await api('DELETE', '/api/types/' + src.id); await loadAll(); location.hash = '#/ajustes'; } catch (er) { fail(er); }
  };
  viewEl.replaceChildren(wrap);
  draw();
}

window.addEventListener('DOMContentLoaded', boot);
