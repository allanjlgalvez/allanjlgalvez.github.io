/* NEXUS — importar contactos desde Google Contactos, iPhone u Outlook (.vcf / .csv) */
'use strict';

/* ---------- lectura de vCard ---------- */

function vUnescape(s) { return s.replace(/\\([nN,;:\\])/g, (m, c) => (c === 'n' || c === 'N') ? '\n' : c); }

function vSplit(s, sep = ';') {
  const out = []; let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) { cur += s[i] + s[i + 1]; i++; continue; }
    if (s[i] === sep) { out.push(cur); cur = ''; continue; }
    cur += s[i];
  }
  out.push(cur);
  return out.map(vUnescape);
}

function qpDecode(v) {
  const bytes = [];
  const enc = new TextEncoder();
  v.replace(/=([0-9A-F]{2})|[\s\S]/gi, (m, hx) => { hx ? bytes.push(parseInt(hx, 16)) : bytes.push(...enc.encode(m)); return ''; });
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function parseVCF(text) {
  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  const lines = [];
  for (const l of raw) {
    if ((l.startsWith(' ') || l.startsWith('\t')) && lines.length) lines[lines.length - 1] += l.slice(1);
    else lines.push(l);
  }
  // Líneas "quoted-printable" (vCard 2.1) que continúan con "=" al final
  for (let i = 0; i < lines.length; i++) {
    if (/QUOTED-PRINTABLE/i.test(lines[i].split(':')[0]))
      while (lines[i].endsWith('=') && i + 1 < lines.length) lines[i] = lines[i].slice(0, -1) + lines.splice(i + 1, 1)[0];
  }
  const cards = [];
  let cur = null;
  for (const l of lines) {
    if (/^BEGIN:VCARD/i.test(l)) { cur = []; continue; }
    if (/^END:VCARD/i.test(l)) { if (cur) cards.push(vcardToContact(cur)); cur = null; continue; }
    if (!cur || !l.trim()) continue;
    let q = false, ci = -1;
    for (let i = 0; i < l.length; i++) { if (l[i] === '"') q = !q; else if (l[i] === ':' && !q) { ci = i; break; } }
    if (ci < 0) continue;
    const head = l.slice(0, ci).split(';');
    let name = head[0].toUpperCase();
    if (name.includes('.')) name = name.split('.').pop();
    const params = {}, types = [];
    head.slice(1).forEach(p => {
      const eq = p.indexOf('=');
      const k = eq < 0 ? 'TYPE' : p.slice(0, eq).toUpperCase();
      const v = (eq < 0 ? p : p.slice(eq + 1)).replace(/"/g, '');
      if (k === 'TYPE') types.push(...v.split(',').map(x => x.toLowerCase()));
      else if (eq < 0 && /^(QUOTED-PRINTABLE|BASE64|B)$/i.test(v)) params.ENCODING = v;
      else params[k] = v;
    });
    let value = l.slice(ci + 1);
    if ((params.ENCODING || '').toUpperCase() === 'QUOTED-PRINTABLE') value = qpDecode(value);
    cur.push({ name, params, types, value });
  }
  return cards;
}

const LABELS = { cell: 'celular', mobile: 'celular', iphone: 'celular', home: 'casa', work: 'trabajo', main: 'principal', other: 'otro', fax: 'fax', pager: 'localizador' };
const labelOf = types => types.map(t => LABELS[t]).filter(Boolean)[0] || '';
const IGNORED_TAGS = new Set(['mycontacts', 'starred', 'my contacts', 'contactos', 'imported on', '']);
const cleanTags = list => [...new Set(list.map(t => t.replace(/^\*\s*/, '').trim().toLowerCase()).filter(t => !IGNORED_TAGS.has(t) && !/^imported on/.test(t)))];

function emptyContact() { return { name: '', nickname: '', bday: '', phones: [], emails: [], addrs: [], org: '', title: '', note: '', tags: [], urls: [], photo: null }; }

function vcardToContact(props) {
  const c = emptyContact();
  let fn = '', n = null;
  for (const p of props) {
    const v = p.value;
    switch (p.name) {
      case 'FN': fn = vUnescape(v).trim(); break;
      case 'N': n = vSplit(v); break;
      case 'NICKNAME': c.nickname = vUnescape(v).trim(); break;
      case 'BDAY': c.bday = v.trim(); break;
      case 'TEL': if (v.trim()) c.phones.push({ v: vUnescape(v).trim(), label: labelOf(p.types) }); break;
      case 'EMAIL': if (v.trim()) c.emails.push(vUnescape(v).trim()); break;
      case 'ADR': {
        const a = vSplit(v).map(x => x.replace(/\n/g, ', ').trim()).filter(Boolean);
        if (a.length) c.addrs.push(a.join(', '));
        break;
      }
      case 'ORG': c.org = vSplit(v).filter(Boolean).join(' · '); break;
      case 'TITLE': c.title = vUnescape(v).trim(); break;
      case 'NOTE': c.note = vUnescape(v).trim(); break;
      case 'CATEGORIES': c.tags.push(...vSplit(v, ',')); break;
      case 'URL': if (v.trim()) c.urls.push(vUnescape(v).trim()); break;
      case 'PHOTO': {
        const enc = (p.params.ENCODING || '').toUpperCase();
        const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(v);
        if (m) c.photo = { b64: m[3], mime: m[1] || 'image/jpeg' };
        else if (enc === 'B' || enc === 'BASE64') c.photo = { b64: v.replace(/\s/g, ''), mime: 'image/' + ((p.types[0] || 'jpeg').replace('jpg', 'jpeg')) };
        else if (/^https?:\/\//i.test(v)) c.photo = { url: v.trim() };
        break;
      }
    }
  }
  if (n) c.name = [n[3], n[1], n[2], n[0], n[4]].map(x => (x || '').trim()).filter(Boolean).join(' ');
  if (fn) c.name = fn;
  c.tags = cleanTags(c.tags);
  return c;
}

/* ---------- lectura de CSV (Google / Outlook) ---------- */

function parseCSVRows(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}

function parseCSV(text) {
  const rows = parseCSVRows(text);
  if (rows.length < 2) return [];
  const H = rows[0].map(x => x.trim());
  const col = re => H.findIndex(x => re.test(x));
  const cols = re => H.map((x, i) => re.test(x) ? i : -1).filter(i => i >= 0);
  const multi = v => v.split(/\s*:::\s*/).map(x => x.trim()).filter(Boolean);
  const idx = {
    name: col(/^(Name|Nombre)$/i),
    first: col(/^(First Name|Given Name)$/i), middle: col(/^(Middle Name|Additional Name)$/i), last: col(/^(Last Name|Family Name)$/i),
    prefix: col(/^(Name Prefix|Title)$/i), suffix: col(/^(Name Suffix|Suffix)$/i),
    nick: col(/^Nickname$/i), bday: col(/^Birthday$/i), notes: col(/^Notes$/i),
    labels: col(/^(Labels|Group Membership|Categories)$/i), photo: col(/^Photo$/i),
    org: col(/^(Organization( 1)? - Name|Organization Name|Company)$/i), title: col(/^(Organization( 1)? - Title|Organization Title|Job Title)$/i),
  };
  const phoneCols = cols(/^Phone \d+ - Value$/i).map(i => ({ i, l: H.indexOf(H[i].replace(/Value$/i, 'Label')) >= 0 ? H.indexOf(H[i].replace(/Value$/i, 'Label')) : H.indexOf(H[i].replace(/Value$/i, 'Type')) }));
  const outlookPhones = cols(/^(Mobile Phone|Home Phone|Business Phone|Primary Phone|Other Phone)$/i);
  const emailCols = [...cols(/^E-mail \d+ - Value$/i), ...cols(/^E-mail( \d)? Address$/i)];
  const addrCols = cols(/^Address \d+ - Formatted$/i);
  const webCols = cols(/^Website \d+ - Value$/i);
  const g = (r, i) => i >= 0 ? (r[i] || '').trim() : '';
  return rows.slice(1).map(r => {
    const c = emptyContact();
    c.name = g(r, idx.name) || [g(r, idx.prefix), g(r, idx.first), g(r, idx.middle), g(r, idx.last), g(r, idx.suffix)].filter(Boolean).join(' ');
    c.nickname = g(r, idx.nick); c.bday = g(r, idx.bday); c.note = g(r, idx.notes);
    c.org = g(r, idx.org); c.title = g(r, idx.title);
    phoneCols.forEach(({ i, l }) => multi(g(r, i)).forEach(v => c.phones.push({ v, label: LABELS[norm(g(r, l)).replace(/[^a-z]/g, '')] || g(r, l).replace(/^\*\s*/, '').toLowerCase() })));
    outlookPhones.forEach(i => multi(g(r, i)).forEach(v => c.phones.push({ v, label: '' })));
    emailCols.forEach(i => c.emails.push(...multi(g(r, i))));
    addrCols.forEach(i => { const v = g(r, i).replace(/\n+/g, ', '); if (v) c.addrs.push(v); });
    webCols.forEach(i => c.urls.push(...multi(g(r, i))));
    c.tags = cleanTags(multi(g(r, idx.labels)));
    const ph = g(r, idx.photo);
    if (/^https:\/\//i.test(ph)) c.photo = { url: ph };
    return c;
  });
}

/* ---------- conversión a registros de NEXUS ---------- */

function parseBday(s) {
  s = (s || '').trim();
  let m;
  if ((m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s))) {
    if (m[1] === '1604' || m[1] === '0000') return { partial: `${+m[3]} ${MESES[+m[2] - 1]}` }; // iPhone: sin año
    return { full: `${m[1]}-${m[2]}-${m[3]}` };
  }
  if ((m = /^--(\d{2})-?(\d{2})/.exec(s))) return { partial: `${+m[2]} ${MESES[+m[1] - 1]}` };
  return s ? { partial: s } : {};
}

function contactToRecord(c, type) {
  const keys = new Set(fieldsOf(type).map(f => f.key));
  const data = {}, extra = [];
  const put = (k, v, label) => {
    if (!hasVal(v)) return;
    if (keys.has(k) && !hasVal(data[k])) data[k] = v;
    else extra.push(`${label}: ${v}`);
  };
  put('apodo', c.nickname, 'Apodo');
  const b = parseBday(c.bday);
  if (b.full) put('fecha_nacimiento', b.full, 'Cumpleaños');
  if (b.partial) extra.push('Cumpleaños: ' + b.partial);
  c.phones.forEach((p, i) => put(['telefono', 'telefono_2'][i] || '-', p.v, 'Teléfono' + (p.label ? ` (${p.label})` : '')));
  c.emails.forEach((e, i) => put(i ? '-' : 'email', e, 'Correo'));
  c.addrs.forEach((a, i) => put(i ? '-' : 'direccion', a, 'Dirección'));
  put('empresa', c.org, 'Empresa');
  put('ocupacion', c.title, 'Puesto');
  c.urls.forEach(u => extra.push('Web: ' + u));
  const note = [c.note, extra.length ? 'Otros datos importados:\n' + extra.join('\n') : ''].filter(Boolean).join('\n\n');
  const name = c.name || c.org || c.emails[0] || (c.phones[0] && c.phones[0].v) || '';
  return { name: name.trim(), data, note, tags: c.tags, photo: c.photo, c };
}

const digits = s => String(s || '').replace(/\D/g, '').slice(-10);

function findExisting(rec, typeId) {
  const n = norm(rec.name);
  const phones = rec.c.phones.map(p => digits(p.v)).filter(d => d.length >= 7);
  const emails = rec.c.emails.map(e => e.toLowerCase());
  return S.entities.find(e => {
    if (e.type_id !== typeId) return false;
    if (norm(e.name) === n) return true;
    const ep = [e.data.telefono, e.data.telefono_2].map(digits).filter(d => d.length >= 7);
    if (phones.some(p => ep.includes(p))) return true;
    return !!e.data.email && emails.includes(String(e.data.email).toLowerCase());
  });
}

/* ---------- diálogo ---------- */

function importDlg() {
  const body = h('div');
  const close = modal('Importar contactos', body, { wide: true });
  const fileIn = h('input', { type: 'file', accept: '.vcf,.vcard,.csv,text/vcard,text/csv', hidden: true, onchange: () => fileIn.files[0] && readFile(fileIn.files[0]) });
  const drop = h('div', {
    class: 'drop', onclick: () => fileIn.click(),
    ondragover: ev => { ev.preventDefault(); drop.classList.add('over'); },
    ondragleave: () => drop.classList.remove('over'),
    ondrop: ev => { ev.preventDefault(); drop.classList.remove('over'); ev.dataTransfer.files[0] && readFile(ev.dataTransfer.files[0]); },
  }, ic('download'), h('div', { style: { 'font-weight': 700, 'margin-top': '6px' } }, 'Arrastra aquí el archivo exportado o toca para elegirlo'),
    h('div', { class: 'hint' }, 'Formatos: vCard (.vcf) o CSV de Google / Outlook'));

  body.append(
    h('ol', { class: 'steps', style: { 'margin-top': 0 } },
      h('li', null, 'En la PC abre ', h('a', { href: 'https://contacts.google.com', target: '_blank', rel: 'noopener noreferrer' }, 'contacts.google.com'), '.'),
      h('li', null, 'En el menú de la izquierda elige ', h('b', null, 'Exportar'), '.'),
      h('li', null, 'Selecciona ', h('b', null, 'Contactos'), ' (todos) y el formato ', h('b', null, 'vCard (para Contactos de iOS)'), '. Presiona ', h('b', null, 'Exportar'), '.'),
      h('li', null, 'Se descarga ', h('code', null, 'contacts.vcf'), '. Arrástralo aquí abajo.')),
    h('p', { class: 'hint' }, 'También funciona con contactos exportados de iPhone (iCloud) u Outlook. El archivo se lee aquí mismo; no se envía a ningún lado.'),
    drop, fileIn);

  async function readFile(f) {
    let text;
    try { text = await f.text(); } catch (er) { return fail(er); }
    let contacts;
    try { contacts = /BEGIN:VCARD/i.test(text) ? parseVCF(text) : parseCSV(text); } catch (er) { return toast('No pude leer el archivo: ' + er.message, true); }
    contacts = contacts.filter(c => c.name || c.org || c.emails.length || c.phones.length);
    if (!contacts.length) return toast('No encontré contactos en ese archivo', true);
    preview(contacts);
  }

  function preview(contacts) {
    const ptype = S.types.find(t => fieldsOf(t).some(f => f.key === 'telefono')) || S.types[0];
    const typeSel = h('select', { value: String(ptype.id), onchange: () => draw() }, S.types.map(t => h('option', { value: String(t.id) }, t.name)));
    typeSel.value = String(ptype.id);
    const tagIn = h('input', { type: 'text', value: 'google', placeholder: 'ninguna' });
    const hasUrlPhotos = contacts.some(c => c.photo && c.photo.url);
    const photosChk = h('input', { type: 'checkbox', checked: true });
    const list = h('div', { class: 'picklist', style: { 'max-height': '46vh' } });
    const summary = h('div', { class: 'muted' });
    let rows = [];

    const draw = () => {
      const type = S.T.get(+typeSel.value);
      rows = contacts.map(c => {
        const rec = contactToRecord(c, type);
        const dup = findExisting(rec, type.id);
        return { rec, dup, on: true, action: dup ? 'completar' : 'crear' };
      });
      list.replaceChildren(...rows.map(row => {
        const { rec, dup } = row;
        const sub = [rec.c.phones[0] && rec.c.phones[0].v, rec.c.emails[0], rec.c.org].filter(Boolean).join(' · ');
        const chk = h('input', { type: 'checkbox', checked: true, onchange: ev => { row.on = ev.target.checked; count(); } });
        const av = h('div', { class: 'av round', style: { '--c': type.color, ...(rec.photo && rec.photo.b64 ? { 'background-image': `url("data:${rec.photo.mime};base64,${rec.photo.b64}")` } : {}) } }, rec.photo && rec.photo.b64 ? null : ic(type.icon));
        return h('label', { class: 'res', style: { cursor: 'pointer' } }, chk, av,
          h('div', { style: { flex: 1, 'min-width': 0 } },
            h('div', { class: 't' }, rec.name, rec.tags.length ? h('span', { class: 'muted', style: { 'font-weight': 500 } }, '  #' + rec.tags.join(' #')) : null),
            h('div', { class: 's' }, sub || '—')),
          dup ? h('select', { style: { width: 'auto', 'font-size': '14px', padding: '5px 28px 5px 8px' }, title: 'Ya existe: ' + dup.name, onclick: ev => ev.stopPropagation(), onchange: ev => { row.action = ev.target.value; count(); } },
            h('option', { value: 'completar' }, 'Ya existe → completar'),
            h('option', { value: 'omitir' }, 'Ya existe → omitir'),
            h('option', { value: 'crear' }, 'Ya existe → duplicar'))
            : h('span', { class: 'tbadge', style: { '--c': 'var(--gr)' } }, 'Nuevo'));
      }));
      count();
    };
    const count = () => {
      const sel = rows.filter(r => r.on && r.action !== 'omitir');
      const dups = rows.filter(r => r.dup).length;
      summary.textContent = `${contacts.length} contactos en el archivo · ${dups} ya existen · se importarán ${sel.length}`;
      go.disabled = !sel.length;
    };
    const go = h('button', { class: 'btn solid', onclick: () => run() }, ic('download'), 'Importar');

    body.replaceChildren(
      h('div', { class: 'form' },
        h('label', { class: 'f' }, h('span', null, 'Guardar como'), typeSel),
        h('label', { class: 'f' }, h('span', null, 'Etiqueta para todos'), tagIn),
        hasUrlPhotos ? h('label', { class: 'f chk wide', style: { 'padding-top': 0 } }, photosChk, h('span', null, 'Descargar las fotos de perfil de Google (necesita internet)')) : null),
      h('div', { style: { display: 'flex', 'align-items': 'center', gap: '10px', margin: '16px 0 0', 'flex-wrap': 'wrap' } }, summary, h('div', { class: 'sp' }),
        h('button', { class: 'btn sm mut', onclick: () => { rows.forEach(r => r.on = true); list.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = true); count(); } }, 'Todos'),
        h('button', { class: 'btn sm mut', onclick: () => { rows.forEach(r => r.on = false); list.querySelectorAll('input[type=checkbox]').forEach(c => c.checked = false); count(); } }, 'Ninguno')),
      list,
      h('p', { class: 'hint' }, '«Completar» solo llena los datos vacíos del registro existente; nunca borra lo que ya tienes. Teléfonos, correos y direcciones adicionales se guardan como nota en la línea de tiempo.'),
      h('div', { class: 'acts' }, h('button', { class: 'btn mut', onclick: () => close() }, 'Cancelar'), go));
    draw();

    async function run() {
      const type = S.T.get(+typeSel.value);
      const extraTag = tagIn.value.trim().toLowerCase();
      const todo = rows.filter(r => r.on && r.action !== 'omitir');
      const bar = h('div', { style: { height: '100%', width: '0%', background: 'var(--cy)', 'box-shadow': '0 0 14px var(--cy)', transition: 'width .15s' } });
      const status = h('div', { class: 'muted', style: { 'margin-top': '10px' } });
      body.replaceChildren(h('div', { class: 'kick' }, 'Importando'),
        h('div', { style: { height: '10px', border: '1px solid var(--line2)', margin: '14px 0' } }, bar), status);
      const st = { created: 0, updated: 0, photos: 0, photoFail: 0, errors: 0 };
      const day = today();
      for (let i = 0; i < todo.length; i++) {
        const { rec, dup, action } = todo[i];
        status.textContent = `${i + 1} de ${todo.length}: ${rec.name}`;
        const tags = [...new Set([...rec.tags, ...(extraTag ? [extraTag] : [])])];
        try {
          let id, hadPhoto = false;
          if (dup && action === 'completar') {
            const data = { ...dup.data };
            Object.entries(rec.data).forEach(([k, v]) => { if (!hasVal(data[k])) data[k] = v; });
            await api('PUT', '/api/entities/' + dup.id, { type_id: dup.type_id, name: dup.name, tags: [...new Set([...dup.tags, ...tags])], data });
            id = dup.id; hadPhoto = !!dup.photo_id; st.updated++;
          } else {
            id = (await api('POST', '/api/entities', { type_id: type.id, name: rec.name, tags, data: rec.data })).id;
            st.created++;
          }
          if (rec.note) await api('POST', `/api/entities/${id}/events`, { date: day, kind: 'nota', title: 'Importado de contactos', body: rec.note });
          if (rec.photo && !hadPhoto) {
            if (rec.photo.b64) {
              try {
                const bin = Uint8Array.from(atob(rec.photo.b64), ch => ch.charCodeAt(0));
                const file = new File([bin], 'foto-contacto.' + (rec.photo.mime.split('/')[1] || 'jpg'), { type: rec.photo.mime });
                const fd = new FormData();
                fd.append('file', file, file.name);
                const th = await makeThumb(file); if (th) fd.append('thumb', th, 'thumb.jpg');
                fd.append('foto', '1');
                await api('POST', `/api/entities/${id}/files`, fd); st.photos++;
              } catch { st.photoFail++; }
            } else if (rec.photo.url && photosChk.checked) {
              try { await api('POST', `/api/entities/${id}/photo-url`, { url: rec.photo.url }); st.photos++; } catch { st.photoFail++; }
            }
          }
        } catch (er) { st.errors++; console.warn('importar', rec.name, er); }
        bar.style.width = ((i + 1) / todo.length * 100) + '%';
      }
      await loadAll();
      body.replaceChildren(
        h('div', { class: 'pulse', style: { width: '80px', height: '80px', margin: '4px auto 16px' } }, ic('person')),
        h('dl', { class: 'kv', style: { 'max-width': '360px', margin: '0 auto', 'font-size': '17px' } },
          h('dt', null, 'Nuevos'), h('dd', null, st.created),
          h('dt', null, 'Completados'), h('dd', null, st.updated),
          h('dt', null, 'Fotos'), h('dd', null, st.photos + (st.photoFail ? ` (${st.photoFail} no disponibles)` : '')),
          st.errors ? [h('dt', null, 'Errores'), h('dd', { style: { color: 'var(--mg)' } }, st.errors)] : null),
        h('p', { class: 'hint', style: { 'text-align': 'center' } }, 'Ahora puedes conectar a tus contactos entre sí (familia, pareja, amigos…) desde cada expediente.'),
        h('div', { class: 'acts', style: { 'justify-content': 'center' } },
          h('button', { class: 'btn', onclick: () => { close(); location.hash = '#/lista'; route(); } }, ic('list'), 'Ver registros'),
          h('button', { class: 'btn solid', onclick: () => { close(); location.hash = '#/red'; route(); } }, ic('graph'), 'Ver la red')));
    }
  }
}
