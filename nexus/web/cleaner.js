/* NEXUS — Depurador de contactos: duplicados, incompletos, empresas, triage rápido, papelera y exportación */
'use strict';

const CL = { typeId: null, tag: '', showVerified: false, sel: {}, limit: {} };
let TRI = null; // sesión de triage en curso

/* ================= Análisis ================= */

const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es', 'live.com', 'live.com.mx', 'msn.com',
  'yahoo.com', 'yahoo.com.mx', 'yahoo.es', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'prodigy.net.mx', 'protonmail.com', 'proton.me', 'gmx.com', 'zoho.com']);

const BIZ_WORDS = new Set(['soporte', 'support', 'ventas', 'sales', 'info', 'informes', 'informacion', 'noreply', 'donotreply', 'banco', 'bank', 'bancomer', 'bbva',
  'banamex', 'santander', 'banorte', 'hsbc', 'scotiabank', 'facturacion', 'factura', 'facturas', 'billing', 'taller', 'servicio', 'servicios', 'service',
  'atencion', 'clientes', 'contacto', 'admin', 'administracion', 'reservaciones', 'reservas', 'pedidos', 'cotizaciones', 'sucursal', 'tienda', 'farmacia',
  'hospital', 'clinica', 'consultorio', 'laboratorio', 'restaurante', 'seguros', 'aseguradora', 'agencia', 'refaccionaria', 'ferreteria', 'plomero',
  'electricista', 'cerrajero', 'mecanico', 'gasolinera', 'hotel', 'recepcion', 'cobranza', 'envios', 'paqueteria', 'telcel', 'izzi', 'totalplay',
  'megacable', 'cfe', 'imss', 'infonavit', 'uber', 'didi', 'rappi', 'amazon', 'mercadolibre', 'notificaciones', 'newsletter', 'mailer']);
const BIZ_PHRASES = ['sa de cv', 's a de c v', 'no reply', 'do not reply', 'servicio al cliente', 'call center'];

const normPhone = v => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 7 ? d.slice(-10) : ''; };
const nameTokens = n => norm(n).replace(/[^a-z0-9ñ]+/g, ' ').trim().split(' ').filter(Boolean);
const hasLetter = s => /\p{L}/u.test(s || '');

function contactOf(e) {
  const fs = fieldsOf(typeOf(e));
  const phones = fs.filter(f => f.type === 'phone').map(f => e.data[f.key]).filter(hasVal).map(String);
  const emails = fs.filter(f => f.type === 'email').map(f => e.data[f.key]).filter(hasVal).map(v => String(v).trim().toLowerCase());
  return { phones, emails, pkeys: [...new Set(phones.map(normPhone).filter(Boolean))], domains: emails.map(m => m.split('@')[1] || '') };
}

function completeness(e) {
  return Object.values(e.data).filter(hasVal).length + (e.photo_id ? 3 : 0) + e.tags.length + relationsOf(e.id).length * 2;
}

function lev(a, b, maxD) {
  if (Math.abs(a.length - b.length) > maxD) return maxD + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > maxD) return maxD + 1;
    prev = cur;
  }
  return prev[b.length];
}

function similarNames(ta, tb) {
  const A = new Set(ta), B = new Set(tb);
  const [small, big] = A.size <= B.size ? [A, B] : [B, A];
  if (small.size >= 2 && [...small].every(t => big.has(t))) return true;
  const a = [...ta].sort().join(' '), b = [...tb].sort().join(' ');
  if (Math.min(a.length, b.length) < 8) return a === b && a.length > 0;
  const maxD = Math.floor(Math.max(a.length, b.length) * 0.12);
  return lev(a, b, maxD) <= maxD;
}

const notDupSet = () => new Set(JSON.parse(localStorage.getItem('nx.notdup') || '[]'));
const pairKey = (a, b) => a < b ? a + ':' + b : b + ':' + a;

function analyze(list) {
  const notdup = notDupSet();
  const info = new Map(list.map(e => [e.id, contactOf(e)]));
  const parent = new Map(list.map(e => [e.id, e.id]));
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const edges = [];
  const link = (a, b, why) => { if (a === b || notdup.has(pairKey(a, b))) return; edges.push([a, b, why]); parent.set(find(a), find(b)); };

  const byKey = (getKeys, why) => {
    const m = new Map();
    list.forEach(e => getKeys(e).forEach(k => { if (!m.has(k)) m.set(k, []); m.get(k).push(e.id); }));
    m.forEach(ids => { for (let i = 1; i < ids.length; i++) link(ids[0], ids[i], why); });
  };
  byKey(e => info.get(e.id).pkeys, 'phone');
  byKey(e => info.get(e.id).emails, 'email');

  // Nombres parecidos: índice por palabra para no comparar todos contra todos
  const toks = new Map(list.filter(e => hasLetter(e.name)).map(e => [e.id, nameTokens(e.name)]));
  const idx = new Map();
  toks.forEach((ts, id) => ts.filter(t => t.length >= 3).forEach(t => { if (!idx.has(t)) idx.set(t, []); idx.get(t).push(id); }));
  const seen = new Set();
  idx.forEach(ids => {
    if (ids.length > 250) return;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const k = pairKey(ids[i], ids[j]);
      if (seen.has(k)) continue;
      seen.add(k);
      if (similarNames(toks.get(ids[i]), toks.get(ids[j]))) link(ids[i], ids[j], 'name');
    }
  });

  const groups = new Map();
  list.forEach(e => { const r = find(e.id); if (!groups.has(r)) groups.set(r, { ids: [], why: new Set() }); groups.get(r).ids.push(e.id); });
  edges.forEach(([a, , why]) => groups.get(find(a)).why.add(why));
  const dupGroups = [...groups.values()].filter(g => g.ids.length > 1)
    .map(g => ({ ...g, members: g.ids.map(id => S.E.get(id)), strong: g.why.has('phone') || g.why.has('email') }))
    .sort((a, b) => (b.strong - a.strong) || a.members[0].name.localeCompare(b.members[0].name));
  const dupOf = new Map();
  dupGroups.forEach(g => g.ids.forEach(id => dupOf.set(id, g)));

  const typeHasContact = t => fieldsOf(t).some(f => f.type === 'phone' || f.type === 'email');
  const incomplete = [], business = [];
  for (const e of list) {
    const c = info.get(e.id);
    if (e.verified && !CL.showVerified) continue;
    const why = [];
    if (!hasLetter(e.name) || e.name.includes('@')) why.push('Sin nombre');
    if (typeHasContact(typeOf(e)) && !c.phones.length && !c.emails.length) why.push('Sin teléfono ni correo');
    if (why.length) incomplete.push({ e, why });

    const text = ' ' + norm([e.name, e.data.empresa, e.data.ocupacion, ...c.emails].filter(Boolean).join(' ')).replace(/[^a-z0-9ñ]+/g, ' ') + ' ';
    const bwhy = [];
    const words = new Set(text.trim().split(' '));
    for (const w of words) if (BIZ_WORDS.has(w)) bwhy.push('«' + w + '»');
    for (const p of BIZ_PHRASES) if (text.includes(' ' + p + ' ')) bwhy.push('«' + p + '»');
    const corp = c.domains.filter(d => d && !FREE_MAIL.has(d));
    if (!c.phones.length && corp.length) bwhy.push('Solo correo corporativo (' + corp[0] + ')');
    if (bwhy.length) business.push({ e, why: [...new Set(bwhy)].slice(0, 4) });
  }
  return { info, groups: dupGroups, dupOf, incomplete, business, incSet: new Set(incomplete.map(x => x.e.id)), bizMap: new Map(business.map(x => [x.e.id, x.why])) };
}

/* ================= Acciones ================= */

function toastUndo(msg, undo) {
  const t = h('div', { class: 'toast cut', style: { 'pointer-events': 'auto', display: 'flex', 'align-items': 'center', gap: '14px' } }, msg,
    h('button', { class: 'btn sm', onclick: async () => { t.remove(); await undo(); } }, ic('undo'), 'Deshacer'));
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 7000);
}

async function trashMany(ids, label) {
  if (!ids.length) return;
  try {
    await api('POST', '/api/trash', { ids });
    await loadAll(); route();
    toastUndo(label || `${ids.length} movido(s) a la papelera`, async () => {
      try { await api('POST', '/api/trash/restore', { ids }); await loadAll(); route(); toast('Restaurado'); } catch (er) { fail(er); }
    });
  } catch (er) { fail(er); }
}

async function verifyMany(ids, value = true) {
  if (!ids.length) return;
  try { await api('POST', '/api/verify', { ids, value }); await loadAll(); route(); toast(value ? `${ids.length} marcado(s) como verificado(s)` : 'Verificación quitada'); } catch (er) { fail(er); }
}

async function mergeGroup(keepId, ids, quiet) {
  const r = await api('POST', '/api/merge', { keep_id: keepId, ids: ids.filter(i => i !== keepId) });
  if (!quiet) {
    await loadAll(); route();
    toast(`Fusionados ${r.merged + 1} registros en uno${r.conflicts ? ' · datos extra guardados como nota' : ''}. Los duplicados están en la papelera.`);
  }
  return r;
}

/* ================= Vista principal ================= */

function cleanerScope() {
  return S.entities.filter(e => e.type_id === CL.typeId && (!CL.tag || e.tags.includes(CL.tag)));
}

async function viewCleaner(tab) {
  if (!CL.typeId || !S.T.get(CL.typeId)) CL.typeId = (S.types.find(t => fieldsOf(t).some(f => f.type === 'phone')) || S.types[0] || {}).id;
  if (!CL.typeId) { viewEl.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'nodata' }, 'Primero crea un tipo de registro.'))); return; }
  let trash = [];
  try { trash = await api('GET', '/api/trash'); } catch (er) { fail(er); }
  if (!location.hash.startsWith('#/depurador')) return;

  const t = S.T.get(CL.typeId);
  document.documentElement.style.setProperty('--acc', 'var(--cy)');
  const list = cleanerScope();
  const A = analyze(list);
  const verified = list.filter(e => e.verified).length;
  const pending = list.length - verified;

  const typeSel = h('select', { onchange: ev => { CL.typeId = +ev.target.value; TRI = null; route(); } }, S.types.map(x => h('option', { value: String(x.id) }, x.name)));
  typeSel.value = String(CL.typeId);
  const tags = [...new Set(S.entities.filter(e => e.type_id === CL.typeId).flatMap(e => e.tags))].sort();
  const tagSel = h('select', { onchange: ev => { CL.tag = ev.target.value; TRI = null; route(); } }, h('option', { value: '' }, 'Todas las etiquetas'), tags.map(x => h('option', { value: x }, x)));
  tagSel.value = CL.tag;

  const TABS = [
    ['duplicados', 'Duplicados', A.groups.length, 'merge'],
    ['incompletos', 'Incompletos', A.incomplete.length, 'alert'],
    ['empresas', 'Empresas / servicios', A.business.length, 'building'],
    ['triage', 'Triage rápido', pending, 'bolt'],
    ['papelera', 'Papelera', trash.length, 'trash'],
    ['exportar', 'Exportar', null, 'download'],
  ];
  if (!TABS.some(x => x[0] === tab)) tab = 'duplicados';
  const pct = list.length ? Math.round(verified / list.length * 100) : 0;

  const body = h('div');
  viewEl.replaceChildren(h('div', { class: 'page cl-page tab-' + tab },
    h('div', { class: 'cl-head' },
      h('div', null, h('div', { class: 'kick' }, 'Herramientas'), h('h1', null, 'Depurador de contactos'),
        h('p', { class: 'muted', style: { margin: '6px 0 0' } }, 'Limpia tu base: fusiona duplicados, descarta lo que no sirve y exporta una lista limpia. Nada se borra sin pasar por la papelera.')),
      h('div', { class: 'cl-stats panel cut' },
        h('div', null, h('b', null, list.length), h('span', null, 'en revisión')),
        h('div', null, h('b', { style: { color: 'var(--gr)' } }, verified), h('span', null, 'verificados')),
        h('div', null, h('b', { style: { color: 'var(--mg)' } }, trash.length), h('span', null, 'en papelera')),
        h('div', { class: 'meter' }, h('i', { style: { width: pct + '%' } })))),
    h('div', { class: 'filters cl-filters' },
      h('label', { class: 'f', style: { 'min-width': '180px' } }, h('span', null, 'Tipo de registro'), typeSel),
      h('label', { class: 'f', style: { 'min-width': '200px' } }, h('span', null, 'Etiqueta'), tagSel),
      h('label', { class: 'f chk', style: { 'padding-top': '18px' } },
        h('input', { type: 'checkbox', checked: CL.showVerified, onchange: ev => { CL.showVerified = ev.target.checked; route(); } }),
        h('span', null, 'Mostrar también los verificados'))),
    h('div', { class: 'tabs' }, TABS.map(([id, label, n, icon]) => h('a', { class: 'tab' + (id === tab ? ' on' : ''), href: '#/depurador/' + id },
      ic(icon), ' ', label, n != null ? h('span', { class: 'n' }, n) : null))),
    body));

  switch (tab) {
    case 'duplicados': return body.append(dupView(A));
    case 'incompletos': return body.append(pickView('incompletos', A.incomplete, A, {
      intro: 'Contactos sin nombre real, o sin teléfono ni correo. Normalmente se pueden descartar.',
      bigTrash: true, empty: 'No hay contactos incompletos. ¡Bien!'
    }));
    case 'empresas': return body.append(pickView('empresas', A.business, A, {
      intro: 'Contactos que parecen empresas, bancos o servicios (por palabras como «soporte», «ventas», «noreply»… o por tener solo un correo corporativo). Revisa y descarta los que no quieras en tu agenda personal.',
      empty: 'No se detectaron empresas ni servicios.'
    }));
    case 'triage': return body.append(triageView(list, A));
    case 'papelera': return body.append(trashView(trash));
    case 'exportar': return body.append(exportView(trash.length));
  }
}

function contactLine(e, c) {
  return [...c.phones.slice(0, 2), ...c.emails.slice(0, 1), e.data.empresa].filter(Boolean).join(' · ') || 'Sin datos de contacto';
}
const reasonChip = (txt, color) => h('span', { class: 'rchip', style: { '--c': color || 'var(--yl)' } }, txt);

/* ---------- duplicados ---------- */

function dupView(A) {
  const wrap = h('div');
  if (!A.groups.length) return h('div', { class: 'nodata' }, 'No se encontraron duplicados.');
  const strong = A.groups.filter(g => g.strong);
  const lim = CL.limit.dup || 30;
  wrap.append(h('div', { class: 'cl-bar' },
    h('span', { class: 'muted' }, `${A.groups.length} grupos de posibles duplicados. Se marca para conservar el más completo; puedes cambiarlo.`),
    h('div', { class: 'sp' }),
    strong.length ? h('button', {
      class: 'btn solid', onclick: async () => {
        if (!await confirmDlg('Fusión automática', `Se fusionarán ${strong.length} grupos que comparten teléfono o correo, conservando en cada uno el registro más completo. Los datos que no quepan se guardan como nota y los duplicados van a la papelera.`, 'Fusionar todos')) return;
        let n = 0;
        toast('Fusionando…');
        for (const g of strong) {
          const keep = [...g.members].sort((a, b) => completeness(b) - completeness(a))[0];
          try { await mergeGroup(keep.id, g.ids, true); n++; } catch (er) { fail(er); }
        }
        await loadAll(); route(); toast(`${n} grupos fusionados. Los duplicados están en la papelera.`);
      }
    }, ic('merge'), `Fusionar ${strong.length} con teléfono/correo idéntico`) : null));

  A.groups.slice(0, lim).forEach(g => {
    let keep = [...g.members].sort((a, b) => completeness(b) - completeness(a))[0].id;
    const radios = [];
    const card = h('section', { class: 'panel cut dupgroup' },
      h('div', { class: 'ph' },
        h('div', { style: { display: 'flex', gap: '6px', 'flex-wrap': 'wrap', flex: 1 } },
          g.why.has('phone') ? reasonChip('Mismo teléfono', 'var(--cy)') : null,
          g.why.has('email') ? reasonChip('Mismo correo', 'var(--cy)') : null,
          g.why.has('name') ? reasonChip('Nombre parecido', 'var(--yl)') : null),
        h('span', { class: 'count' }, g.members.length + ' registros')),
      h('div', { class: 'dupgrid' }, g.members.map(m => {
        const c = A.info.get(m.id);
        const r = h('input', { type: 'radio', name: 'keep' + g.ids[0], checked: m.id === keep, onchange: () => { keep = m.id; radios.forEach(x => x.el.classList.toggle('keep', x.id === keep)); } });
        const el = h('label', { class: 'member' + (m.id === keep ? ' keep' : '') },
          h('div', { style: { display: 'flex', gap: '10px', 'align-items': 'center' } }, r, avatar(m, 'lg'),
            h('div', { style: { 'min-width': 0, flex: 1 } }, h('a', { class: 'nm', href: '#/e/' + m.id, onclick: ev => ev.stopPropagation() }, m.name),
              h('div', { class: 'muted', style: { 'font-size': '13px' } }, `${Object.values(m.data).filter(hasVal).length} datos · ${relationsOf(m.id).length} conexiones${m.verified ? ' · verificado' : ''}`))),
          h('dl', { class: 'kv', style: { margin: '10px 0 6px', 'font-size': '14px' } },
            c.phones.length ? [h('dt', null, 'Tel.'), h('dd', null, c.phones.join(', '))] : null,
            c.emails.length ? [h('dt', null, 'Correo'), h('dd', null, c.emails.join(', '))] : null,
            m.data.empresa ? [h('dt', null, 'Empresa'), h('dd', null, m.data.empresa)] : null,
            m.tags.length ? [h('dt', null, 'Etiq.'), h('dd', null, m.tags.join(', '))] : null),
          h('div', { class: 'keepmark' }, 'SE CONSERVA'),
          h('button', { class: 'btn sm mg', type: 'button', onclick: ev => { ev.preventDefault(); trashMany([m.id], `«${m.name}» a la papelera`); } }, ic('trash'), 'Papelera'));
        radios.push({ id: m.id, el });
        return el;
      })),
      h('div', { class: 'acts', style: { 'margin-top': '14px' } },
        h('button', {
          class: 'btn mut', onclick: () => {
            const s = notDupSet();
            for (let i = 0; i < g.ids.length; i++) for (let j = i + 1; j < g.ids.length; j++) s.add(pairKey(g.ids[i], g.ids[j]));
            localStorage.setItem('nx.notdup', JSON.stringify([...s]));
            toast('Marcados como «no son duplicados»'); route();
          }
        }, 'No son duplicados'),
        h('button', { class: 'btn solid', onclick: async () => { try { await mergeGroup(keep, g.ids); } catch (er) { fail(er); } } }, ic('merge'), 'Fusionar en el marcado')));
    wrap.append(card);
  });
  if (A.groups.length > lim) wrap.append(h('div', { style: { 'text-align': 'center' } }, h('button', { class: 'btn', onclick: () => { CL.limit.dup = lim + 30; route(); } }, `Mostrar más (${A.groups.length - lim})`)));
  return wrap;
}

/* ---------- listas con selección (incompletos / empresas / papelera) ---------- */

function selList(key, items, renderRow, bulk) {
  const sel = CL.sel[key] = new Set([...(CL.sel[key] || [])].filter(id => items.some(x => x.e.id === id)));
  const lim = CL.limit[key] || 100;
  const countEl = h('span', { class: 'muted' });
  const all = h('input', { type: 'checkbox' });
  const rows = h('div', { class: 'picklist', style: { 'max-height': 'none' } });
  const sync = () => {
    countEl.textContent = sel.size ? `${sel.size} seleccionado(s)` : `${items.length} en la lista`;
    all.checked = sel.size === items.length && items.length > 0;
    bar.querySelectorAll('[data-needsel]').forEach(b => b.disabled = !sel.size);
  };
  all.addEventListener('change', () => { items.forEach(x => all.checked ? sel.add(x.e.id) : sel.delete(x.e.id)); rows.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = all.checked); sync(); });
  items.slice(0, lim).forEach(x => {
    const cb = h('input', { type: 'checkbox', checked: sel.has(x.e.id), onchange: ev => { ev.target.checked ? sel.add(x.e.id) : sel.delete(x.e.id); sync(); } });
    rows.append(h('label', { class: 'res cl-row' }, cb, avatar(x.e), renderRow(x)));
  });
  const bar = h('div', { class: 'cl-bar' }, h('label', { class: 'f chk', style: { 'padding-top': 0 } }, all, h('span', null, 'Todos')), countEl, h('div', { class: 'sp' }), bulk(sel));
  sync();
  return h('div', null, bar, rows,
    items.length > lim ? h('div', { style: { 'text-align': 'center', 'margin-top': '12px' } }, h('button', { class: 'btn', onclick: () => { CL.limit[key] = lim + 200; route(); } }, `Mostrar más (${items.length - lim})`)) : null);
}

function pickView(key, items, A, { intro, bigTrash, empty }) {
  if (!items.length) return h('div', { class: 'nodata' }, empty);
  return h('div', null,
    h('p', { class: 'muted', style: { 'margin-top': 0 } }, intro),
    bigTrash ? h('div', { style: { margin: '0 0 14px' } }, h('button', {
      class: 'btn mg solid', onclick: async () => {
        if (await confirmDlg('Mover a la papelera', `Se moverán los ${items.length} contactos de esta lista a la papelera. Podrás restaurarlos.`, 'Mover a papelera')) trashMany(items.map(x => x.e.id));
      }
    }, ic('trash'), `Seleccionar todos y mover a papelera (${items.length})`)) : null,
    selList(key, items, x => h('div', { style: { flex: 1, 'min-width': 0 } },
      h('div', { class: 't' }, h('a', { href: '#/e/' + x.e.id, onclick: ev => ev.stopPropagation() }, x.e.name), x.e.verified ? h('span', { class: 'rchip', style: { '--c': 'var(--gr)', 'margin-left': '8px' } }, 'verificado') : null),
      h('div', { class: 's' }, contactLine(x.e, A.info.get(x.e.id))),
      h('div', { style: { display: 'flex', gap: '6px', 'flex-wrap': 'wrap', 'margin-top': '4px' } }, x.why.map(w => reasonChip(w, key === 'incompletos' ? 'var(--mg)' : 'var(--or)')))),
      sel => [
        h('button', { class: 'btn sm', 'data-needsel': '', onclick: () => verifyMany([...sel]) }, ic('check'), 'Conservar'),
        h('button', { class: 'btn sm mg', 'data-needsel': '', onclick: () => trashMany([...sel]) }, ic('trash'), 'Mover a papelera')]));
}

/* ---------- triage rápido ---------- */

function triageView(list, A) {
  const key = CL.typeId + '|' + CL.tag;
  if (!TRI || TRI.key !== key) {
    const flag = e => (A.dupOf.has(e.id) ? 4 : 0) + (A.incSet.has(e.id) ? 2 : 0) + (A.bizMap.has(e.id) ? 1 : 0);
    const queue = list.filter(e => !e.verified).sort((a, b) => flag(b) - flag(a) || a.name.localeCompare(b.name)).map(e => e.id);
    TRI = { key, queue, pos: 0, skipped: [], history: [], round: 1, kept: 0, trashed: 0, busy: false };
  }
  const box = h('div', { class: 'triage' });

  const advance = () => { while (TRI.pos < TRI.queue.length && !S.E.has(TRI.queue[TRI.pos])) TRI.pos++; };
  const draw = (dir) => {
    advance();
    const old = box.querySelector('.tri-card');
    if (old && dir) { old.classList.add('go-' + dir); setTimeout(() => render(), 150); } else render();
  };
  const act = async (kind) => {
    if (TRI.busy || TRI.pos >= TRI.queue.length) return;
    const id = TRI.queue[TRI.pos];
    TRI.busy = true;
    try {
      if (kind === 'trash') { await api('POST', '/api/trash', { ids: [id] }); TRI.trashed++; S.entities = S.entities.filter(e => e.id !== id); S.E.delete(id); }
      if (kind === 'keep') { await api('POST', '/api/verify', { ids: [id], value: true }); TRI.kept++; const e = S.E.get(id); if (e) e.verified = new Date().toISOString(); }
      if (kind === 'skip') TRI.skipped.push(id);
      TRI.history.push({ kind, id, pos: TRI.pos, round: TRI.round });
      TRI.pos++;
      TRI.dirty = true;
      draw({ trash: 'left', keep: 'right', skip: 'down' }[kind]);
    } catch (er) { fail(er); }
    TRI.busy = false;
  };
  const undo = async () => {
    if (TRI.busy) return;
    const last = TRI.history.pop();
    if (!last) return toast('Nada que deshacer');
    if (last.round !== TRI.round) { TRI.history.push(last); return toast('Solo se puede deshacer dentro de la ronda actual'); }
    TRI.busy = true;
    try {
      if (last.kind === 'trash') { await api('POST', '/api/trash/restore', { ids: [last.id] }); TRI.trashed--; await loadAll(); }
      if (last.kind === 'keep') { await api('POST', '/api/verify', { ids: [last.id], value: false }); TRI.kept--; const e = S.E.get(last.id); if (e) e.verified = ''; }
      if (last.kind === 'skip') TRI.skipped.pop();
      TRI.pos = last.pos;
      toast('Deshecho');
      render();
    } catch (er) { fail(er); }
    TRI.busy = false;
  };

  const onKey = ev => {
    if (document.querySelector('.modal-bg') || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); undo(); return; }
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = { ArrowLeft: 'trash', ArrowRight: 'keep', ArrowDown: 'skip' }[ev.key];
    if (k) { ev.preventDefault(); act(k); }
  };
  document.addEventListener('keydown', onKey);
  S.leave = () => { document.removeEventListener('keydown', onKey); if (TRI && TRI.dirty) { TRI.dirty = false; loadAll().catch(() => { }); } };

  function render() {
    advance();
    const total = TRI.queue.length;
    const stats = h('div', { class: 'tri-stats' },
      h('span', null, h('b', { style: { color: 'var(--gr)' } }, TRI.kept), ' conservados'),
      h('span', null, h('b', { style: { color: 'var(--mg)' } }, TRI.trashed), ' a papelera'),
      h('span', null, h('b', { style: { color: 'var(--yl)' } }, TRI.skipped.length), ' saltados'),
      TRI.round > 1 ? h('span', { class: 'muted' }, `Ronda ${TRI.round} (saltados)`) : null,
      h('div', { class: 'sp' }),
      h('button', { class: 'btn sm mut', onclick: undo, title: 'Ctrl+Z' }, ic('undo'), 'Deshacer'),
      h('button', { class: 'btn sm mut', onclick: () => { TRI = null; route(); } }, ic('restore'), 'Reiniciar'));

    if (TRI.pos >= total) {
      const left = TRI.skipped.length;
      box.replaceChildren(stats, h('div', { class: 'panel cut tri-done' },
        h('div', { class: 'pulse', style: { margin: '0 auto 16px' } }, ic('check')),
        h('h2', { style: { 'text-align': 'center' } }, total ? 'Revisión terminada' : 'No hay contactos pendientes'),
        h('p', { class: 'muted', style: { 'text-align': 'center' } }, total ? `Conservaste ${TRI.kept} y mandaste ${TRI.trashed} a la papelera.` : 'Todos los contactos de esta selección ya están verificados. Activa «Mostrar también los verificados» en otras pestañas o cambia el filtro.'),
        h('div', { class: 'acts', style: { 'justify-content': 'center' } },
          left ? h('button', { class: 'btn solid', onclick: () => { TRI.queue = TRI.skipped; TRI.skipped = []; TRI.pos = 0; TRI.round++; render(); } }, ic('skip'), `Revisar los ${left} saltados`) : null,
          h('a', { class: 'btn', href: '#/depurador/papelera' }, ic('trash'), 'Ver papelera'),
          h('a', { class: 'btn', href: '#/depurador/exportar' }, ic('download'), 'Exportar base limpia'))));
      return;
    }

    const e = S.E.get(TRI.queue[TRI.pos]);
    const t = typeOf(e);
    const c = contactOf(e);
    const u = photoURL(e);
    const flags = [];
    const g = A.dupOf.get(e.id);
    if (g) flags.push(reasonChip('Posible duplicado de ' + g.members.filter(m => m.id !== e.id).map(m => m.name).slice(0, 2).join(', '), 'var(--cy)'));
    if (A.incSet.has(e.id)) A.incomplete.find(x => x.e.id === e.id).why.forEach(w => flags.push(reasonChip(w, 'var(--mg)')));
    if (A.bizMap.has(e.id)) flags.push(reasonChip('Posible empresa: ' + A.bizMap.get(e.id).join(', '), 'var(--or)'));

    const kv = h('dl', { class: 'kv' });
    const add = (k, v) => { if (hasVal(v)) kv.append(h('dt', null, k), h('dd', null, v)); };
    c.phones.forEach((p, i) => add(i ? 'Teléfono ' + (i + 1) : 'Teléfono', h('a', { href: 'tel:' + p.replace(/[^\d+]/g, '') }, p)));
    c.emails.forEach((m, i) => add(i ? 'Correo ' + (i + 1) : 'Correo', m));
    add('Empresa', e.data.empresa); add('Puesto', e.data.ocupacion); add('Apodo', e.data.apodo);
    if (e.data.fecha_nacimiento) add('Cumpleaños', fmtDate(e.data.fecha_nacimiento));
    add('Dirección', e.data.direccion);
    const rels = relationsOf(e.id);

    const card = h('div', { class: 'tri-card panel cut', style: { '--c': t.color } },
      h('span', { class: 'corner tl' }), h('span', { class: 'corner br' }),
      h('div', { class: 'tri-photo' + (u ? '' : ' nophoto'), style: u ? { 'background-image': `url("${u}")` } : {} }, u ? null : ic(t.icon)),
      h('div', { class: 'tri-body' },
        h('span', { class: 'tbadge', style: { '--c': t.color } }, ic(t.icon), t.name),
        h('div', { class: 'tri-name' }, e.name),
        flags.length ? h('div', { style: { display: 'flex', gap: '6px', 'flex-wrap': 'wrap', margin: '8px 0' } }, flags) : null,
        kv.childNodes.length ? kv : h('p', { class: 'muted' }, 'Sin datos de contacto.'),
        e.tags.length ? h('div', { class: 'tags' }, e.tags.map(x => h('span', { class: 'tag' }, x))) : null,
        rels.length ? h('div', { class: 'muted', style: { 'margin-top': '8px' } }, `${rels.length} conexión(es): ` + rels.slice(0, 3).map(x => x.other.name).join(', ')) : null,
        h('a', { href: '#/e/' + e.id, class: 'hint', style: { display: 'inline-block', 'margin-top': '10px' } }, 'Abrir expediente completo →')));

    // Deslizar en pantallas táctiles
    let sx = 0, sy = 0;
    card.addEventListener('pointerdown', ev => { sx = ev.clientX; sy = ev.clientY; });
    card.addEventListener('pointerup', ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy)) act(dx < 0 ? 'trash' : 'keep');
      else if (dy > 90) act('skip');
    });

    box.replaceChildren(stats,
      h('div', { class: 'tri-progress' },
        h('div', { class: 'tri-count' }, h('b', null, TRI.pos + 1), ` de ${total}`),
        h('div', { class: 'meter' }, h('i', { style: { width: ((TRI.pos) / total * 100) + '%' } }))),
      card,
      h('div', { class: 'tri-btns' },
        h('button', { class: 'tbtn mg', onclick: () => act('trash') }, ic('trash'), h('span', null, 'Descartar'), h('kbd', null, '←')),
        h('button', { class: 'tbtn yl', onclick: () => act('skip') }, ic('skip'), h('span', null, 'Saltar'), h('kbd', null, '↓')),
        h('button', { class: 'tbtn gr', onclick: () => act('keep') }, ic('check'), h('span', null, 'Conservar'), h('kbd', null, '→'))),
      h('p', { class: 'hint', style: { 'text-align': 'center' } }, 'Teclado: ← descartar · → conservar (verificado) · ↓ saltar para después · Ctrl+Z deshacer. En el celular puedes deslizar la tarjeta.'));
  }
  render();
  return box;
}

/* ---------- papelera ---------- */

function trashView(trash) {
  if (!trash.length) return h('div', { class: 'nodata' }, 'La papelera está vacía.');
  trash.forEach(e => { e.tags = Array.isArray(e.tags) ? e.tags : []; e.data = e.data || {}; });
  const items = trash.map(e => ({ e }));
  return h('div', null,
    h('div', { class: 'cl-bar' },
      h('span', { class: 'muted' }, `${trash.length} registro(s) en la papelera. No aparecen en la red, la búsqueda ni las exportaciones.`),
      h('div', { class: 'sp' }),
      h('button', {
        class: 'btn mg solid', onclick: async () => {
          if (!await confirmDlg('Vaciar papelera', `Se borrarán DEFINITIVAMENTE ${trash.length} registros con sus notas y archivos. Esto no se puede deshacer. Te recomendamos descargar antes un respaldo (Sistema → Respaldo).`, 'Vaciar definitivamente')) return;
          try { const r = await api('POST', '/api/trash/purge', { all: true }); toast(`${r.count} registros eliminados definitivamente`); route(); } catch (er) { fail(er); }
        }
      }, ic('trash'), 'Vaciar papelera')),
    selList('papelera', items, x => h('div', { style: { flex: 1, 'min-width': 0 } },
      h('div', { class: 't' }, x.e.name, ' ', h('span', { class: 'muted', style: { 'font-weight': 500 } }, '· ' + typeOf(x.e).name)),
      h('div', { class: 's' }, `En papelera desde ${fmtDate(x.e.deleted)}` + (x.e.data._fusionado_con ? ` · fusionado con ${x.e.data._fusionado_con}` : ''))),
      sel => [
        h('button', { class: 'btn sm', 'data-needsel': '', onclick: async () => { try { await api('POST', '/api/trash/restore', { ids: [...sel] }); await loadAll(); toast(`${sel.size} restaurado(s)`); route(); } catch (er) { fail(er); } } }, ic('restore'), 'Restaurar'),
        h('button', {
          class: 'btn sm mg', 'data-needsel': '', onclick: async () => {
            if (!await confirmDlg('Eliminar definitivamente', `Se borrarán para siempre ${sel.size} registro(s). No se puede deshacer.`, 'Eliminar')) return;
            try { const r = await api('POST', '/api/trash/purge', { ids: [...sel] }); toast(`${r.count} eliminados definitivamente`); route(); } catch (er) { fail(er); }
          }
        }, ic('trash'), 'Eliminar definitivamente')]));
}

/* ---------- exportar ---------- */

function exportView(trashCount) {
  const typeSel = h('select', { onchange: () => upd() }, S.types.map(x => h('option', { value: String(x.id) }, x.name)));
  typeSel.value = String(CL.typeId);
  const csvBtn = h('a', { class: 'btn solid', download: '' }, ic('download'), 'Descargar CSV para Google');
  const csvInfo = h('div', { class: 'muted' });
  const upd = () => {
    csvBtn.href = '/api/export/google.csv?type=' + typeSel.value;
    csvInfo.textContent = `${S.entities.filter(e => e.type_id === +typeSel.value).length} contactos`;
  };
  upd();
  return h('div', { class: 'cfg', style: { 'margin-top': 0 } },
    h('section', { class: 'panel cut' }, h('span', { class: 'corner tl' }), h('span', { class: 'corner br' }),
      h('div', { class: 'ph' }, h('h2', null, 'CSV compatible con Google Contactos')),
      h('p', { class: 'muted', style: { 'margin-top': 0 } }, 'Nombre, apodo, teléfonos, correos, dirección, empresa, puesto, cumpleaños y etiquetas. Por privacidad no incluye datos médicos, notas ni archivos.'),
      h('label', { class: 'f', style: { 'max-width': '260px' } }, h('span', null, 'Tipo de registro'), typeSel),
      h('div', { style: { display: 'flex', gap: '14px', 'align-items': 'center', margin: '14px 0 0' } }, csvBtn, csvInfo)),
    h('section', { class: 'panel cut' },
      h('div', { class: 'ph' }, h('h2', null, 'JSON completo')),
      h('p', { class: 'muted', style: { 'margin-top': 0 } }, 'Toda tu base limpia: todos los tipos, campos, etiquetas, conexiones y línea de tiempo (sin los archivos). Útil como copia legible o para otras apps.'),
      h('div', { style: { display: 'flex', gap: '14px', 'align-items': 'center', margin: '14px 0 0' } },
        h('a', { class: 'btn solid', href: '/api/export/nexus.json', download: '' }, ic('download'), 'Descargar JSON'),
        h('span', { class: 'muted' }, `${S.entities.length} registros`))),
    h('section', { class: 'panel cut full' },
      h('div', { class: 'ph' }, h('h2', null, 'Para que la limpieza llegue a tu celular')),
      h('p', { class: 'muted', style: { 'margin-top': 0 } }, `Las exportaciones excluyen los ${trashCount} registros de la papelera.`),
      h('ol', { class: 'steps' },
        h('li', null, 'En contacts.google.com haz primero un respaldo: ', h('b', null, 'Exportar → CSV de Google'), '. Guárdalo bien.'),
        h('li', null, 'Selecciona todos tus contactos en Google y bórralos (quedan 30 días en la papelera de Google por si acaso).'),
        h('li', null, 'En Google usa ', h('b', null, 'Importar'), ' y elige el CSV limpio que descargaste aquí.'),
        h('li', null, 'Tu celular Android se sincroniza solo con Google en unos minutos.'))));
}
