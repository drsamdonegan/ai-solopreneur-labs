import { fieldGroups, fields, labels, display, prepare, product, rawForm, referenceTables, validate,
  editorialForm, imageSource, pieces, validateEditorial } from './rules.js?v=studio-1';
import { renderStorefront, renderProduct } from './storefront.js?v=empty-store-1';

const main = document.querySelector('#main');
const notice = document.querySelector('#notice');
const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const index = new Map();
const records = new Map();
const originalImages = new Map();
const editorLabels = { ...labels, description: 'Product description', badge: 'Product badge', colourHex: 'Swatch colour (hex)', imageUrl: 'Image URL', imageUrl2: 'Alternate image URL' };
let data, tables, prefix, selected, validated = false, listFilter = 'all', search = '';
let toastTimer, storageRefresh, page = 0;
let importPreview = [];
const pageSize = 25;

const icons = {
  content:'<rect x="4" y="3" width="15" height="18" rx="2"/><path d="M8 8h7M8 12h7M8 16h4"/>',
  storefront:'<path d="M3 10h18l-2-6H5zM5 11v9h14v-9M9 20v-6h6v6"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.4"/><path d="m15.5 15.5 5 5"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', back:'<path d="m10 5-7 7 7 7M4 12h16"/>',
  external:'<path d="M13 4h7v7M20 4l-9 9M9 5H4v15h15v-5"/>',
  sheets:'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18M3 14h18M9 4v16"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 8"/>',
  filter:'<path d="M3 6h18M6 12h12M9 18h6"/>'
};
function icon(name) {
  return '<svg aria-hidden="true" viewBox="0 0 24 24" class="cf-icon" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">' + icons[name] + '</svg>';
}
function say(message) {
  clearTimeout(toastTimer);
  notice.textContent = message;
  toastTimer = setTimeout(() => { notice.textContent = ''; }, 5000);
}
function read(id) {
  const json = localStorage.getItem(prefix + id);
  return json ? JSON.parse(json) : null;
}
function write(row, record) {
  localStorage.setItem(prefix + row.id, JSON.stringify(record));
  records.set(row.id, record);
}
function asset(value) {
  return originalImages.get(value) || imageSource(value, location.href);
}
function picture(url, alt, lazy = false) {
  const src = asset(url);
  return src ? '<img src="' + h(src) + '" alt="' + h(alt) + '"' + (lazy ? ' loading="lazy"' : '') + '>' : icon('image');
}
function editorialRow(id, base = {}) {
  const raw = Object.fromEntries(fields.map(([key]) => [key, display(base[key])]));
  Object.assign(raw, { imageUrl2: base.imageUrl2 || '', description: base.description || '', badge: base.badge || '', colourHex: base.colourHex || '' });
  return { id, source: base.id ? 'sample' : 'custom', base, raw, review: [] };
}
function getLive(row) {
  const saved = records.get(row.id);
  return saved?.live || null;
}
function liveItems() {
  return [...index.values()].filter(getLive).sort((a, b) => {
    const stamp = row => records.get(row.id)?.publishedAt || (records.get(row.id)?.live ? 1 : 0);
    return stamp(b) - stamp(a);
  }).map(row => ({...getLive(row), publishedAt:records.get(row.id)?.publishedAt || 0}));
}
function formFor(row) {
  return records.get(row.id)?.form || (row.source ? row.raw : rawForm(row));
}
function isEditorial(row) { return !!row.source || !!records.get(row.id)?.editorial; }
function needsReview(row) { return !isEditorial(row) && row.review.length > 0 && !records.get(row.id)?.reviewed; }
function prepared(row) {
  const form = formFor(row);
  return isEditorial(row) ? editorialForm(row, form) : form;
}
function errorsFor(row) {
  const f = prepared(row);
  if (!isEditorial(row)) return validate(row, f);
  const errors = validateEditorial(f, location.href);
  const skus = new Set(pieces(f.skus));
  if ([...index.values()].some(other => other.id !== row.id && getLive(other)?.skus?.some(sku => skus.has(sku)))) {
    errors.styleCode = 'Another live product uses one of these size SKUs. Change the style or colour code.';
  }
  return errors;
}
function snapshot(row) {
  const f = prepared(row);
  if (!isEditorial(row)) return product(row, f);
  const normal = { ...f, price: String(f.price).replace(/^(?:AUD\s*)?\$?\s*/i, ''),
    salePrice: String(f.salePrice || '').replace(/^(?:AUD\s*)?\$?\s*/i, '') };
  return { ...row.base, ...product(row, normal) };
}
function status(row) {
  const saved = records.get(row.id);
  if (!saved) return 'Inbox';
  const live = getLive(row);
  if (live && !saved.changed) return 'Published';
  if (needsReview(row) || (!isEditorial(row) && Object.keys(errorsFor(row)).length)) return 'Review';
  if (isEditorial(row) && Object.keys(errorsFor(row)).length) return 'Draft';
  return 'Ready';
}
function tag(state) {
  const cls = state.toLowerCase();
  return '<span class="cf-tag cf-tag-' + cls + '">' + h(state) + '</span>';
}
function titleFor(row) {
  const f = formFor(row);
  return f.title || row.clean?.title || f.styleName || 'Untitled product';
}
function rowSource(row) { return {sample:'Collection',custom:'Editorial'}[row.source] || 'Weekly drop'; }
function entryLink(id) { return '#cms/' + encodeURIComponent(id); }
function cfHeader(section) {
  return '<header class="cf-top"><a class="cf-brand" href="#cms" aria-label="Catalogue Studio home"><i class="cf-mark" aria-hidden="true"></i><strong>Catalogue Studio</strong></a><span class="cf-top-divider"></span>' +
    '<a class="cf-space" href="#cms">' + icon('grid') + ' Retail catalogue</a><span class="cf-env">master</span>' +
    '<div class="cf-top-links"><a href="#cms" ' + (section === 'content' ? 'aria-current="page"' : '') + '>' + icon('content') + ' Content</a><a href="#store">' + icon('storefront') + ' Storefront</a></div>' +
    '<a class="cf-deck" href="../#slide-17">Workshop slides ' + icon('external') + '</a></header>';
}
const filters = [['all','All entries'],['collection','Collection products'],['workbook','Weekly drop'],['Review','Needs review'],['Ready','Ready to publish'],['Published','Published'],['Draft','Drafts']];
function matches(row, filter, state) {
  if (filter === 'collection') return row.source === 'sample';
  return filter === 'all' || (filter === 'workbook' ? !row.source : filter === 'Draft' ? ['Inbox','Draft'].includes(state) : state === filter);
}
function visibleRows() {
  const query = search.trim().toLowerCase();
  return [...index.values()].filter(row => matches(row, listFilter, status(row)) &&
    (!query || [titleFor(row),row.id,formFor(row).styleCode,formFor(row).colour].join(' ').toLowerCase().includes(query))).sort((a,b) => {
      const rank = row => records.get(row.id)?.updatedAt || (row.source === 'sample' ? 1 : 0);
      return rank(b) - rank(a);
    });
}
function listResults() {
  const list = document.getElementById('cf-rows');
  const rows = visibleRows();
  document.getElementById('cf-count').textContent = rows.length + (rows.length === 1 ? ' entry' : ' entries');
  page = Math.min(page, Math.max(0,Math.ceil(rows.length / pageSize) - 1));
  const start = page * pageSize;
  document.getElementById('cf-page').textContent = rows.length ? (start + 1) + '–' + Math.min(start + pageSize, rows.length) + ' of ' + rows.length : '0 entries';
  document.getElementById('cf-prev').disabled = page === 0;
  document.getElementById('cf-next').disabled = start + pageSize >= rows.length;
  list.innerHTML = rows.slice(start,start + pageSize).map(row => {
    const f = formFor(row), state = status(row);
    return '<tr><td><a href="' + entryLink(row.id) + '" class="cf-row-link"><span class="cf-thumb">' + picture(f.imageUrl, '', true) + '</span><span><strong>' + h(titleFor(row)) + '</strong><small>' + h(row.id) + '</small></span></a></td><td>Product</td><td>' + h(rowSource(row)) + '</td><td>' + tag(state) + '</td></tr>';
  }).join('') || '<tr><td colspan="4" class="cf-no-results">No entries match this search.</td></tr>';
}
function contentList() {
  selected = null;
  validated = false;
  const all = [...index.values()];
  const states = all.map(status);
  const applicable = (filter) => all.filter((row,i) => matches(row,filter,states[i])).length;
  const filterButtons = filters.map(([value,label]) => '<button type="button" class="cf-filter' + (listFilter === value ? ' cf-active' : '') + '" data-filter="' + value + '"' + (listFilter === value ? ' aria-current="true"' : '') + '><span>' + h(label) + '</span><small>' + applicable(value) + '</small></button>').join('');
  main.innerHTML = cfHeader('content') + '<div class="cf-list-shell"><aside class="cf-views"><h2>Views</h2>' + filterButtons +
    '<div class="cf-view-bottom"><a href="weekly-drop.xlsx" download>' + icon('sheets') + ' Download workbook</a><button type="button" data-do="reset">Reset workshop</button><small>Saved in this browser</small></div></aside>' +
    '<section class="cf-content"><div class="cf-heading"><div><div class="cf-crumb">Retail catalogue <span>/</span> master</div><h1>Content</h1></div><button type="button" class="cf-primary" data-do="new">' + icon('plus') + ' Add entry</button></div>' +
    '<div class="cf-list-tools"><label class="cf-search">' + icon('search') + '<input id="cf-search" aria-label="Search entries" type="search" placeholder="Search entries" value="' + h(search) + '"></label>' +
    '<select id="cf-filter-select" aria-label="Filter entries">' + filters.map(([val,label]) => '<option value="' + val + '"' + (val === listFilter ? ' selected' : '') + '>' + label + '</option>').join('') + '</select></div>' +
    '<div class="cf-table-tools"><span id="cf-count"></span><div><button type="button" data-do="paste-rows">Paste spreadsheet rows</button><button type="button" data-do="batch"' + (!data.rows.some(row => status(row) === 'Inbox') ? ' disabled' : '') + '>Run batch rules</button><button type="button" data-do="publish-ready"' + (!states.includes('Ready') ? ' disabled' : '') + '>Publish ready drafts</button></div></div>' +
    '<div class="cf-table-scroll"><table class="cf-table"><thead><tr><th>Title</th><th>Content type</th><th>Source</th><th>Status</th></tr></thead><tbody id="cf-rows"></tbody></table></div><div class="cf-pager"><span id="cf-page"></span><button id="cf-prev" data-do="previous-page">Previous</button><button id="cf-next" data-do="next-page">Next</button></div></section></div>' + importDialog();
  listResults();
}
function importDialog() {
  return '<dialog class="cf-import" id="cf-import" aria-labelledby="cf-import-title"><header><h2 id="cf-import-title">Paste spreadsheet rows</h2><button type="button" data-do="close-import" aria-label="Close spreadsheet import">×</button></header>' +
    '<p>Copy the header row and products from the workbook’s Storefront Collection sheet. Preview the rows, then import them as drafts.</p>' +
    '<label for="cf-import-text">Spreadsheet rows</label><textarea id="cf-import-text" spellcheck="false" placeholder="Paste the copied spreadsheet cells here"></textarea>' +
    '<div id="cf-import-result" role="status" aria-live="polite"></div><footer><button type="button" data-do="preview-import">Preview rows</button><button type="button" data-do="confirm-import" class="cf-primary" disabled>Import drafts</button></footer></dialog>';
}
function spreadsheetRows(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  const input = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"' && quoted && input[i + 1] === '"') {
      value += '"'; i++;
    } else if (char === '"' && (quoted || value === '')) {
      quoted = !quoted;
    } else if (!quoted && (char === '\t' || char === '\n')) {
      row.push(value); value = '';
      if (char === '\n') { rows.push(row); row = []; }
    } else {
      value += char;
    }
  }
  if (quoted) throw Error('A quoted spreadsheet cell is incomplete. Copy the complete selection again.');
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows.filter(cells => cells.some(cell => cell.trim()));
}
function previewImport() {
  importPreview = [];
  const result = document.getElementById('cf-import-result');
  const confirm = main.querySelector('[data-do="confirm-import"]');
  confirm.disabled = true;
  try {
    const rows = spreadsheetRows(document.getElementById('cf-import-text').value);
    const headers = rows.shift()?.map(value => value.trim()) || [];
    const required = ['id','title','styleCode','colourCode','sizes','stock','price','imageUrl'];
    if (required.some(key => !headers.includes(key)) || new Set(headers).size !== headers.length) {
      throw Error('Include the workbook header row with id, title, styleCode, colourCode, sizes, stock, price and imageUrl.');
    }
    const allowed = new Set(['id', ...fields.map(([key]) => key), 'imageUrl2','description','badge','colourHex']);
    if (headers.some(key => !allowed.has(key))) throw Error('Use the original Storefront Collection column headers.');
    if (!rows.length || rows.length > 2000) throw Error('Paste between 1 and 2,000 product rows.');
    const ids = new Set(), skus = new Set(), issues = [], entries = [];
    rows.forEach((cells, position) => {
      const rowNumber = position + 2;
      if (cells.length !== headers.length) {
        issues.push('Row ' + rowNumber + ' has a different number of columns.'); return;
      }
      const values = Object.fromEntries(headers.map((key, i) => [key, cells[i].trim()]));
      const id = values.id;
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || ids.has(id)) {
        issues.push('Row ' + rowNumber + ' needs a unique product ID.'); return;
      }
      ids.add(id);
      const row = index.get(id) || editorialRow(id);
      const form = { ...row.raw, ...values };
      delete form.id;
      form.styleCode = form.styleCode.replace(/^0+(?=\d)/, '');
      form.colourCode = form.colourCode.replace(/^0+(?=\d)/, '');
      form.stock = display(pieces(form.stock).map(qty => /^\d+$/.test(qty) ? Number(qty) : qty));
      const normalized = row.source ? editorialForm(row, form) : form;
      const errors = row.source ? validateEditorial(normalized, location.href) : validate(row, normalized);
      const rowSkus = pieces(normalized.skus);
      if (rowSkus.some(sku => skus.has(sku))) errors.skus = 'A size SKU occurs in another pasted row.';
      for (const sku of rowSkus) skus.add(sku);
      const names = Object.keys(errors);
      if (names.length) issues.push(id + ' — ' + names.map(key => errors[key]).join(' '));
      entries.push({ row, form:normalized });
    });
    for (const row of index.values()) {
      if (!ids.has(row.id) && getLive(row)?.skus?.some(sku => skus.has(sku))) issues.push('A pasted SKU already belongs to published product ' + row.id + '.');
    }
    if (issues.length) {
      result.innerHTML = '<p class="cf-import-error">Check ' + issues.length + ' ' + (issues.length === 1 ? 'issue' : 'issues') + ' before importing.</p><ul>' + issues.slice(0,20).map(issue => '<li>' + h(issue) + '</li>').join('') + '</ul>';
      return;
    }
    importPreview = entries;
    result.textContent = entries.length + ' products · ' + skus.size + ' size SKUs ready to import as drafts.';
    confirm.disabled = false;
  } catch (error) {
    result.textContent = error.message;
  }
}
function importDrafts() {
  if (!importPreview.length) return;
  const previous = importPreview.map(({row}) => [row.id, read(row.id)]);
  const created = [];
  try {
    for (const {row,form} of importPreview) {
      if (!index.has(row.id)) { index.set(row.id,row); created.push(row.id); }
      write(row, { ...read(row.id), form, reviewed:false, custom:row.source === 'custom', changed:true, updatedAt:Date.now() });
    }
  } catch (error) {
    for (const [id] of previous) localStorage.removeItem(prefix + id);
    for (const [id,record] of previous) {
      if (record) localStorage.setItem(prefix + id, JSON.stringify(record));
      loadRecord(id);
    }
    for (const id of created) index.delete(id);
    document.getElementById('cf-import-result').textContent = 'The import could not finish. Your previous products are unchanged. ' + error.message;
    return;
  }
  const count = importPreview.length;
  importPreview = []; listFilter = 'Ready'; page = 0;
  contentList(); say(count + ' drafts imported. Review them, then choose Publish ready drafts.');
}
const mainFields = ['title','price','salePrice','imageUrl','imageUrl2','description'];
const editGroups = [
  ['Variants and inventory', ['styleCode','colourCode','styleName','colour','sizes','stock','styleColour','skus']],
  ['Merchandising', ['division','department','productClass','category','activity','badge','colourHex']],
  ['Source identifiers', ['pcmId','commerceId','globalId','imageStatus']]
];
const guide = {
  imageUrl2:'Optional second image for the product card and detail page.',
  sizes:'Separate sizes with a vertical bar, e.g. XS | S | M.',
  stock:'Enter stock quantities in the same order as sizes.',
  skus:'Join the style, colour and size with underscores.',
  styleColour:'Join the style and colour codes with an underscore.'
};
function field(row, key, errors) {
  const f = formFor(row), editorial = isEditorial(row);
  const generated = editorial && ['styleColour','skus'].includes(key);
  const val = generated ? prepared(row)[key] : f[key] ?? '';
  const id = 'field-' + key;
  const err = errors[key];
  const source = !row.source && Object.hasOwn(row.raw,key) ? 'Sheet · ' + (display(row.raw[key]) || '(blank)') : '';
  const example = {title:'Product title',imageUrl:'https://…',imageUrl2:'https://…',price:'0.00'};
  const attributes = ' id="' + id + '" name="' + key + '" aria-describedby="' + id + '-hint"' +
    (generated ? ' readonly' : '') + (err ? ' aria-invalid="true"' : '') +
    (['price','salePrice'].includes(key) ? ' inputmode="decimal"' : '') +
    (example[key] ? ' placeholder="' + example[key] + '"' : '');
  const input = key === 'description' ? '<textarea rows="3"' + attributes + '>' + h(val) + '</textarea>' :
    '<input autocomplete="off"' + attributes + ' value="' + h(val) + '">';
  return '<div class="cf-field' + (err ? ' cf-field-invalid' : '') + '"><label for="' + id + '">' + h(editorLabels[key]) + '</label>' + input +
    '<small id="' + id + '-hint">' + h(err || source || (generated ? 'Generated from the variant fields.' : guide[key] || '')) + '</small></div>';
}
function reviewBox(row) {
  if (isEditorial(row) || !row.review.length) return '';
  const f = formFor(row), saved = records.get(row.id);
  return '<section class="cf-review"><h3>Merchandiser review</h3>' + row.review.map(key => '<p><b>' + h(labels[key]) + '</b> · ' + h(display(row.clean[key])) + '</p>').join('') +
    (row.review.includes('imageUrl') ? '<div class="cf-compare"><figure id="cf-entered-image">' + picture(f.imageUrl,'Image entered in the CMS') + '<figcaption>Entered image</figcaption></figure><figure>' + picture(row.clean.imageUrl, 'Approved asset for ' + row.clean.title) + '<figcaption>Approved asset</figcaption></figure></div>' : '') +
    '<label><input id="reviewed" type="checkbox"' + (saved?.reviewed ? ' checked' : '') + '> I checked the flagged fields against the reference.</label></section>';
}
function statusMarkup(row) {
  const state = status(row), live = getLive(row);
  const label = live && state !== 'Published' ? 'Changed' : state;
  return tag(label);
}
function publishedLink(row) {
  return '#product/' + encodeURIComponent(row.id) + '/' + encodeURIComponent(getLive(row)?.sizes?.[0] || '');
}
function editor(row) {
  selected = row;
  const saved = records.get(row.id), f = formFor(row), live = getLive(row), errors = validated ? errorsFor(row) : {};
  const editorial = isEditorial(row), title = titleFor(row);
  const variantSections = editGroups.map(([name,keys]) => '<details class="cf-details"' + (keys.some(k => errors[k]) ? ' open' : '') + '><summary>' + h(name) + '</summary>' +
    '<div>' + keys.map(k => field(row,k,errors)).join('') + '</div></details>').join('');
  main.innerHTML = cfHeader('content') + '<header class="cf-entry-top"><a class="cf-back" href="#cms" aria-label="Back to entries">' + icon('back') + '</a><a href="#cms">Content</a><span>/</span><span>Product</span><span>/</span><strong id="cf-entry-title">' + h(title) + '</strong></header>' +
    '<div class="cf-editor-layout"><section class="cf-canvas"><div class="cf-tabs"><span>Editor</span></div>' +
    '<form id="entry-form" class="cf-form" novalidate>' + mainFields.map(k => field(row,k,errors)).join('') + variantSections + reviewBox(row) +
    '<div class="cf-form-end"><button type="button" data-do="check">Check fields</button><button type="button" data-do="save">Save draft</button></div></form></section>' +
    '<aside class="cf-sidebar"><div class="cf-tabs"><span>General</span></div><div class="cf-side-body"><section><h3>Status</h3><p class="cf-state-line">Current <span id="entry-state">' + statusMarkup(row) + '</span></p>' +
    '<button class="cf-publish" type="submit" form="entry-form">Publish ' + (live ? 'changes' : 'entry') + '</button><p class="cf-side-small" id="cf-save-state">' + (saved ? 'All changes saved' : 'Draft in this browser') + '</p></section>' +
    '<section><h3>Storefront</h3><div class="cf-cover" id="cf-cover">' + picture(f.imageUrl,'Product image preview') + '</div>' +
    (live ? '<a class="cf-secondary cf-full" href="' + publishedLink(row) + '">Open published entry ' + icon('external') + '</a>' : '<p class="cf-side-small">Publish this entry to display it in the collection.</p>') + '</section>' +
    (!row.source ? '<section><h3>Supplier workbook</h3><p class="cf-side-small">Row ' + h(row.id) + '</p><button type="button" class="cf-full" data-do="prepare">Apply row rules</button><label class="cf-mode"><span>Validation</span><select id="cf-validation"><option value="workbook"' + (!editorial ? ' selected' : '') + '>Match workbook references</option><option value="editorial"' + (editorial ? ' selected' : '') + '>Editorial entry</option></select></label><a class="cf-inline-link" href="weekly-drop.xlsx" download>Download workbook</a></section>' : '') +
    '<section><h3>Entry information</h3><dl><dt>Content type</dt><dd>Product</dd><dt>Entry ID</dt><dd>' + h(row.id) + '</dd><dt>Source</dt><dd>' + h(rowSource(row)) + '</dd></dl></section></div></aside></div>';
}
function save(form, options = {}) {
  const old = read(selected.id) || {};
  write(selected, { ...old, ...options, form, custom: selected.source === 'custom', changed:true, updatedAt:Date.now() });
}
function takeForm() {
  return Object.fromEntries(new FormData(document.querySelector('#entry-form')));
}
function publish(row) {
  if (Object.keys(errorsFor(row)).length || needsReview(row)) return false;
  const old = read(row.id) || {};
  write(row, { ...old, form:formFor(row), live:snapshot(row), changed:false, publishedAt:Date.now(), custom:row.source === 'custom' });
  return true;
}
function handleAction(action) {
  if (action === 'paste-rows') { importPreview = []; document.getElementById('cf-import').showModal(); return; }
  if (action === 'close-import') { document.getElementById('cf-import').close(); return; }
  if (action === 'preview-import') { previewImport(); return; }
  if (action === 'confirm-import') { importDrafts(); return; }
  if (action === 'previous-page' || action === 'next-page') {
    page += action === 'next-page' ? 1 : -1;
    listResults(); document.querySelector('.cf-heading').scrollIntoView({block:'start'}); return;
  }
  if (action === 'new') {
    const id = 'P-' + crypto.randomUUID().split('-')[0].toUpperCase();
    const row = editorialRow(id);
    Object.assign(row.raw, {styleCode:id,colourCode:'00',sizes:'One Size',stock:'0',division:'Women'});
    index.set(id,row);
    write(row,{ form:row.raw, custom:true, changed:true, updatedAt:Date.now() });
    location.hash = entryLink(id);
    return;
  }
  if (action === 'batch') {
    let ready = 0, held = 0;
    for (const row of data.rows) {
      if (read(row.id)) continue;
      write(row, { form:prepare(row,data,tables), reviewed:false, changed:true });
      if (status(row) === 'Ready') ready++; else held++;
    }
    contentList(); say(ready + ' ready to publish. ' + held + ' need review.'); return;
  }
  if (action === 'publish-ready') {
    let n = 0;
    for (const row of index.values()) if (status(row) === 'Ready' && publish(row)) n++;
    contentList(); say(n + ' entries published to the storefront.'); return;
  }
  if (action === 'reset') {
    if (!window.confirm('Reset this browser’s workshop? This clears your drafts and published products, leaving the storefront empty.')) return;
    for (const row of index.values()) {
      localStorage.removeItem(prefix + row.id);
      if (row.source === 'custom') index.delete(row.id);
    }
    records.clear(); listFilter = 'all'; search = ''; contentList(); say('Workshop reset.'); return;
  }
  if (!selected) return;
  if (action === 'prepare') {
    save(prepare(selected,data,tables), {editorial:false, reviewed:false}); validated = true; editor(selected);
    say(status(selected) === 'Review' ? 'Draft prepared. Check the flagged fields.' : 'Draft prepared and ready to publish.');
    return;
  }
  if (['save','check','publish'].includes(action)) {
    save(takeForm());
    if (action === 'save') { say('Draft saved.'); return; }
    validated = true;
    const issues = Object.keys(errorsFor(selected));
    if (issues.length || needsReview(selected)) {
      editor(selected); say(issues.length ? 'Check the highlighted fields.' : 'Confirm the merchandiser review before publishing.');
      document.getElementById('field-' + issues[0])?.focus();
    } else if (action === 'publish' && publish(selected)) {
      validated = false; editor(selected); say('Published to your storefront.');
    } else {
      editor(selected); say('All fields passed validation.');
    }
  }
}
function route() {
  const [view,id,size] = location.hash.slice(1).split('/').map(v => {
    try { return decodeURIComponent(v); } catch { return v; }
  });
  const shop = view === 'store' || view === 'product';
  document.body.dataset.view = shop ? 'store' : 'cms';
  if (shop) {
    selected = null;
    const args = { main, items:liveItems(), colours:data.colours, asset, id, size };
    if (view === 'store') renderStorefront(args); else renderProduct(args);
    document.title = view === 'store' ? 'Women’s New Arrivals · Workshop storefront' : (index.has(id) && getLive(index.get(id))?.title || 'Product') + ' · Workshop storefront';
  } else if (id && index.has(id)) {
    if (selected?.id !== id) validated = false;
    editor(index.get(id));
    document.title = titleFor(selected) + ' · Catalogue Studio';
  } else {
    contentList(); document.title = 'Content · Retail catalogue';
  }
}
document.querySelector('.skip').addEventListener('click', event => {
  event.preventDefault(); main.focus();
});
main.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button?.dataset.filter) {
    listFilter = button.dataset.filter; page = 0; contentList();
  } else if (button?.dataset.do) handleAction(button.dataset.do);
});
main.addEventListener('submit', event => {
  if (event.target.id !== 'entry-form') return;
  event.preventDefault(); handleAction('publish');
});
main.addEventListener('change',event => {
  const el = event.target;
  if (el.id === 'cf-filter-select') { listFilter = el.value; page = 0; contentList(); }
  if (el.id === 'cf-validation') { save(takeForm(),{ editorial:el.value === 'editorial', reviewed:false }); validated = false; editor(selected); }
  if (el.id === 'reviewed') { save(takeForm(),{reviewed:el.checked}); document.getElementById('entry-state').innerHTML = statusMarkup(selected); }
});
main.addEventListener('input', event => {
  const el = event.target;
  if (el.id === 'cf-import-text') {
    importPreview = [];
    main.querySelector('[data-do="confirm-import"]').disabled = true;
    document.getElementById('cf-import-result').textContent = '';
    return;
  }
  if (el.id === 'cf-search') { search = el.value; page = 0; listResults(); return; }
  if (!el.name || el.form?.id !== 'entry-form') return;
  save(takeForm(),selected.review.includes(el.name) ? {reviewed:false} : {});
  if (selected.review.includes(el.name) && document.getElementById('reviewed')) document.getElementById('reviewed').checked = false;
  el.removeAttribute('aria-invalid');
  const fieldNode = el.closest('.cf-field');
  if (fieldNode.classList.contains('cf-field-invalid')) {
    fieldNode.classList.remove('cf-field-invalid'); fieldNode.querySelector('small').textContent = '';
  }
  document.getElementById('entry-state').innerHTML = statusMarkup(selected);
  document.getElementById('cf-save-state').textContent = 'All changes saved';
  if (el.name === 'title') document.getElementById('cf-entry-title').textContent = titleFor(selected);
  if (isEditorial(selected) && ['styleCode','colourCode','sizes'].includes(el.name)) {
    for (const key of ['skus','styleColour']) document.getElementById('field-' + key).value = prepared(selected)[key];
  }
  if (el.name === 'imageUrl') {
    document.getElementById('cf-cover').innerHTML = picture(el.value,'Product image preview');
    const entered = document.getElementById('cf-entered-image');
    if (entered) entered.innerHTML = picture(el.value,'Image entered in the CMS') + '<figcaption>Entered image</figcaption>';
  }
});
function loadRecord(id) {
  const saved = read(id);
  if (saved?.custom && !index.has(id)) index.set(id,editorialRow(id));
  if (saved) records.set(id,saved);
  else {
    records.delete(id);
    if (index.get(id)?.source === 'custom') index.delete(id);
  }
}
window.addEventListener('storage', event => {
  if (!prefix || !event.key?.startsWith(prefix)) return;
  loadRecord(event.key.slice(prefix.length));
  clearTimeout(storageRefresh); storageRefresh = setTimeout(route,40);
});
async function readData(path) {
  const response = await fetch(path);
  if (!response.ok) throw Error('Unable to load ' + path);
  return response.json();
}
async function start() {
  try {
    const [delivery,featured] = await Promise.all([readData('./data.json'),readData('./featured.json')]);
    data = delivery; tables = referenceTables(data);
    prefix = 'hem-vale:catalogue:' + data.version + ':';
    for (const row of data.rows) {
      index.set(row.id,row);
      const file = new URL(row.clean.imageUrl).pathname.split('/').pop();
      originalImages.set(row.clean.imageUrl,'./images/' + file);
    }
    for (const item of featured) {
      if (index.has(item.id)) continue;
      const row = editorialRow(item.id,item);
      const f = editorialForm(row,row.raw);
      row.base = { ...item, ...product(row,f) };
      index.set(row.id,row);
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(prefix)) loadRecord(key.slice(prefix.length));
    }
    window.addEventListener('hashchange',() => { route(); window.scrollTo(0,0); });
    route();
  } catch (error) {
    main.innerHTML = '<div class="cf-error"><h1>Workspace unavailable</h1><p>' + h(error.message) + '</p><a href="../#slide-17">Return to the workshop</a></div>';
  }
}
start();
