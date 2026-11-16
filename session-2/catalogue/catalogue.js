import { fieldGroups, fields, labels, display, prepare, product, rawForm, referenceTables, validate } from './rules.js';

const main = document.querySelector('#main');
const notice = document.querySelector('#notice');
const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const h = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const count = (n, word, plural = word + 's') => n + ' ' + (n === 1 ? word : plural);
let data, byId, tables, storagePrefix, records;
let selected, filter = 'all', search = '', validated = false;
let storeSearch = '', storeCategory = '';
let toastTimer;

function say(message) {
  clearTimeout(toastTimer);
  notice.textContent = message;
  toastTimer = setTimeout(() => { notice.textContent = ''; }, 8500);
}

function readRow(id) {
  const saved = localStorage.getItem(storagePrefix + id);
  return saved ? JSON.parse(saved) : null;
}
function write(row, record) {
  localStorage.setItem(storagePrefix + row.id, JSON.stringify(record));
  records.set(row.id, record);
}
function formFor(row) { return records.get(row.id)?.form ?? rawForm(row); }
function needsCheck(row, record) { return row.review.length > 0 && !record?.reviewed; }
function status(row) {
  const saved = records.get(row.id);
  if (!saved) return 'Inbox';
  const draft = saved.form;
  const errors = validate(row, draft);
  if (Object.keys(errors).length || needsCheck(row, saved)) return 'Review';
  if (saved.live && JSON.stringify(product(row, draft)) === JSON.stringify(saved.live)) return 'Live';
  return 'Ready';
}
function counts() {
  const result = { Inbox: 0, Review: 0, Ready: 0, Live: 0, published: 0 };
  for (const row of data.rows) {
    result[status(row)]++;
    if (records.get(row.id)?.live) result.published++;
  }
  return result;
}

function asset(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url, location.href);
    if (!/^https?:$/.test(parsed.protocol)) return '';
    const localAsset = /(?:^|\/)images\/([a-z0-9-]+\.webp)$/.exec(parsed.pathname);
    if (localAsset && (data.rows.some(row => row.clean.imageUrl === url) || parsed.origin === location.origin)) {
      return './images/' + localAsset[1];
    }
    return parsed.href;
  } catch { return ''; }
}

function price(item) {
  if (item.salePrice == null) return h(money.format(item.price));
  return '<span class="sale">' + h(money.format(item.salePrice)) + '</span> <del>' + h(money.format(item.price)) + '</del>';
}
function imageTag(url, alt, lazy = false) {
  const src = asset(url);
  return src ? '<img src="' + h(src) + '" alt="' + h(alt) + '"' + (lazy ? ' loading="lazy"' : '') + '>' : '<div class="no-image">No image selected</div>';
}
function liveItems() { return data.rows.map(row => records.get(row.id)?.live).filter(Boolean); }
function badge(label) { return '<span class="badge ' + h(label.toLowerCase()) + '">' + h(label) + '</span>'; }
function dotStat(label, n) { return '<span><b>' + n + '</b> ' + h(label) + '</span>'; }

function queue() {
  const list = document.querySelector('#row-list');
  const rows = data.rows.filter(row => {
    const text = [row.id, row.raw.styleCode, row.clean.styleName, row.clean.colour, row.clean.styleColour].join(' ').toLowerCase();
    return (filter === 'all' || status(row) === filter) && text.includes(search.trim().toLowerCase());
  });
  list.innerHTML = rows.map(row => {
    const here = selected.id === row.id;
    return '<a href="#cms/' + row.id + '" class="queue-row' + (here ? ' chosen' : '') + '"' + (here ? ' aria-current="true"' : '') + '>' +
      '<span class="queue-swatch" style="--swatch:' + h(data.colours.find(c => String(c.code) === String(row.clean.colourCode))?.hex) + '"></span>' +
      '<span class="queue-text"><strong>' + h(row.clean.styleName) + '</strong><small>' + h(row.id) + ' <span>·</span> ' + h(row.clean.colour) + '</small></span>' +
      '<span class="status-dot ' + status(row).toLowerCase() + '" aria-label="' + status(row) + '" title="' + status(row) + '"></span></a>';
  }).join('') || '<p class="queue-empty">No matching products.</p>';
  document.querySelector('#queue-total').textContent = count(rows.length, 'product');
}
function filterOptions(stats) {
  return [['all', 'All products', data.rows.length], ...['Inbox','Review','Ready','Live'].map(s => [s, s, stats[s]])]
    .map(([val, name, n]) => '<option value="' + val + '"' + (filter === val ? ' selected' : '') + '>' + name + ' (' + n + ')</option>').join('');
}
function refreshSidebar() {
  const stats = counts();
  document.querySelector('#status-filter').innerHTML = filterOptions(stats);
  document.querySelector('#metrics').innerHTML = dotStat('inbox', stats.Inbox) + dotStat('to review', stats.Review) + dotStat('ready', stats.Ready) + dotStat('live', stats.published);
  document.querySelector('#batch-publish').disabled = !stats.Ready;
  document.querySelector('#batch-clean').disabled = !stats.Inbox;
  queue();
}

const derived = {
  title: 'Join the approved colour and style name with a space.',
  styleColour: 'Join the two unpadded codes with an underscore.',
  skus: 'Append each size to the style / colour key with an underscore.'
};
function inputField(row, form, key, label, errors) {
  const id = 'field-' + key;
  const origin = derived[key] || ('Sheet · ' + (display(row.raw[key]) || '(blank)'));
  const wide = ['title','imageUrl','skus','stock','sizes'].includes(key);
  const fail = errors[key];
  return '<label class="field' + (wide ? ' wide' : '') + (fail ? ' invalid' : '') + '" for="' + id + '"><span>' + h(label) + '</span>' +
    '<input id="' + id + '" name="' + key + '" value="' + h(form[key]) + '" autocomplete="off" spellcheck="false" aria-describedby="' + id + '-hint"' +
      (fail ? ' aria-invalid="true"' : '') + '><small id="' + id + '-hint">' + h(fail || origin) + '</small></label>';
}
function reviewPanel(row, form, saved) {
  if (!row.review.length) return '';
  return '<section class="review-panel"><h3>Merchandiser review</h3><p>Compare the supplier row with the workshop references before publishing.</p>' +
    '<ul>' + row.review.map(key => '<li><b>' + h(labels[key]) + '</b> · ' + h(display(row.clean[key]) || '(blank)') + '</li>').join('') + '</ul>' +
    (row.review.includes('imageUrl') ? '<div class="compare"><figure>' + imageTag(form.imageUrl, 'Image entered in the CMS') + '<figcaption>Entered image</figcaption></figure><figure>' +
        imageTag(row.clean.imageUrl, 'Approved asset for ' + row.clean.title) + '<figcaption>Approved asset</figcaption></figure></div>' : '') +
    '<label class="check"><input id="reviewed" type="checkbox"' + (saved?.reviewed ? ' checked' : '') + '> I checked the flagged field against the reference.</label></section>';
}
function editor() {
  const row = selected, saved = records.get(row.id), form = formFor(row), current = status(row);
  const errors = validated ? validate(row, form) : {};
  const desc = 'Style ' + row.clean.styleCode + ' / ' + row.clean.colour;
  const liveLink = saved?.live ? '<a class="textlink" href="#product/' + row.id + '/' + encodeURIComponent(saved.live.sizes[0]) + '">View live product ↗</a>' : '';
  document.querySelector('#editor').innerHTML =
    '<div class="editor-intro"><div class="edit-image">' + imageTag(form.imageUrl, 'Current source image for ' + row.clean.styleName) + '</div>' +
    '<div class="edit-heading"><div class="kicker">Workbook row ' + h(row.id) + ' ' + badge(current) + '</div><h2>' + h(row.clean.styleName) + '</h2><p>' + h(desc) + '</p>' + liveLink + '</div></div>' +
    '<div class="entry-tools"><div><strong>Product entry</strong><p>Enter the clean values or apply the supplier rules.</p></div><button type="button" data-action="prepare">Apply row rules</button></div>' +
    '<form id="entry-form" novalidate>' + fieldGroups.map((group, index) => {
      const hasErrors = group.fields.some(([key]) => errors[key]);
      return '<details class="field-group"' + (index === 0 || hasErrors ? ' open' : '') + '><summary>' + h(group.name) + '</summary><div class="field-grid">' +
        group.fields.map(([key,label]) => inputField(row, form, key, label, errors)).join('') + '</div></details>';
    }).join('') + reviewPanel(row, form, saved) +
    '<div class="form-actions"><button type="button" data-action="save">Save draft</button><button type="button" data-action="validate">Check fields</button><button type="submit" class="primary">Publish product <span aria-hidden="true">↗</span></button></div></form>';
}
function cms() {
  const previousQueueScroll = document.querySelector('#row-list')?.scrollTop || 0;
  main.innerHTML = '<section class="hero cms-hero"><div><p class="eyebrow">Merchandising workspace</p><h1>Weekly drop<span>.</span></h1><p class="subtitle">Turn the supplier workbook into a shoppable collection.</p></div>' +
    '<div class="hero-actions"><a class="button secondary" href="weekly-drop.xlsx" download>↓ Download workbook</a><a class="textlink" href="#store">Visit storefront ↗</a></div></section>' +
    '<section class="batchbar"><div><p class="small-title">Drop progress</p><div id="metrics" class="metrics"></div></div><div class="batch-actions"><button id="batch-clean" data-action="batch">Run batch rules</button><button id="batch-publish" data-action="publish-ready" class="primary">Publish ready drafts</button></div></section>' +
    '<div class="workbench"><aside class="queue"><div class="queue-controls"><div class="queue-heading"><h2>Product queue</h2><small id="queue-total"></small></div><label class="sr-only" for="find-row">Find a product</label><input type="search" id="find-row" placeholder="Search style, colour or ID" value="' + h(search) + '">' +
    '<label class="sr-only" for="status-filter">Queue status</label><select id="status-filter"></select></div><div id="row-list" aria-label="Product queue"></div></aside><section class="editor" id="editor" aria-label="Product editor"></section></div>' +
    '<div class="local-note"><span>Drafts and published products are saved in this browser.</span><button type="button" class="plain" data-action="reset">Reset this workshop</button></div>';
  refreshSidebar(); editor();
  const list = document.querySelector('#row-list');
  list.scrollTop = previousQueueScroll;
  const chosen = list.querySelector('.chosen');
  if (chosen && (chosen.offsetTop < list.scrollTop || chosen.offsetTop + chosen.offsetHeight > list.scrollTop + list.clientHeight)) list.scrollTop = chosen.offsetTop;
}

function takeForm() { return Object.fromEntries(new FormData(document.querySelector('#entry-form'))); }
function saveEdits(reviewed, changes) {
  const saved = readRow(selected.id) || {};
  write(selected, { ...saved, form: changes ?? takeForm(), reviewed: reviewed ?? !!document.querySelector('#reviewed')?.checked });
}
function publish(row) {
  const saved = readRow(row.id);
  if (!saved || Object.keys(validate(row, saved.form)).length || needsCheck(row, saved)) return false;
  write(row, { ...saved, live: product(row, saved.form) });
  return true;
}
function handleAction(action) {
  if (action === 'batch') {
    let n = 0;
    for (const row of data.rows) {
      const saved = readRow(row.id);
      if (saved) continue;
      write(row, { form: prepare(row, data, tables), reviewed: false }); n++;
    }
    validated = false; cms();
    const stats = counts();
    say(count(n, 'draft') + ' prepared. ' + stats.Ready + ' ready to publish. ' + stats.Review + ' need review.');
  } else if (action === 'publish-ready') {
    let n = 0;
    for (const row of data.rows) if (status(row) === 'Ready' && publish(row)) n++;
    cms(); say(count(n, 'product') + ' published to your storefront.');
  } else if (action === 'reset') {
    if (window.confirm('Clear your drafts and published products for this workshop in this browser?')) {
      for (const row of data.rows) localStorage.removeItem(storagePrefix + row.id);
      records.clear(); validated = false; filter = 'all'; search = '';
      if (location.hash !== '#cms/' + data.rows[0].id) location.hash = 'cms/' + data.rows[0].id;
      else cms();
      say('Your workshop has been reset.');
    }
  } else if (action === 'prepare') {
    saveEdits(false, prepare(selected, data, tables));
    validated = true; refreshSidebar(); editor();
    say(status(selected) === 'Review' ? 'Draft saved for review. Check the highlighted fields.' : 'Clean draft prepared. You can publish it or edit the fields.');
  } else if (action === 'save' || action === 'validate' || action === 'publish') {
    saveEdits(); validated = action !== 'save';
    const errors = validate(selected, formFor(selected));
    const issueCount = Object.keys(errors).length;
    const review = needsCheck(selected, records.get(selected.id));
    let message = 'Draft saved.';
    if (action === 'publish' && !issueCount && !review && publish(selected)) message = 'Published to your storefront. Open the live product to check its size SKUs.';
    else if (action !== 'save') message = issueCount ? count(issueCount, 'field') + ' to correct. Check the highlighted values.' : review ? 'Fields match. Confirm the merchandiser review before publishing.' : 'All fields match the workshop references.';
    refreshSidebar(); editor(); say(message);
    if (validated && issueCount) document.querySelector('[aria-invalid="true"]')?.focus();
  }
}

function storeCard(item) {
  const href = '#product/' + encodeURIComponent(item.id) + '/' + encodeURIComponent(item.sizes[0]);
  return '<a class="product-card" href="' + href + '"><div class="product-photo">' + imageTag(item.imageUrl, item.title, true) +
    '</div><div class="card-meta">' + h(item.division) + ' / ' + h(item.productClass) + '</div><h2>' + h(item.title) +
    '</h2><div class="card-price">' + price(item) + '</div></a>';
}
function filterStore() {
  const term = storeSearch.trim().toLowerCase();
  const products = liveItems().filter(item => (!storeCategory || item.productClass === storeCategory) &&
    [item.title, item.styleCode, item.colour, ...item.skus].join(' ').toLowerCase().includes(term));
  document.querySelector('#shop-count').textContent = count(products.length, 'product');
  document.querySelector('#shop-grid').innerHTML = products.map(storeCard).join('') || '<p class="empty-filter">No products match those filters.</p>';
}
function storefront() {
  const all = liveItems();
  main.innerHTML = '<section class="hero shop-hero"><div><p class="eyebrow">Hem &amp; Vale / Collection</p><h1>New arrivals<span>.</span></h1><p class="subtitle">The latest pieces from our weekly drop.</p></div></section>' +
    (all.length ? '<div class="shop-filters"><b id="shop-count"></b><label class="sr-only" for="shop-category">Category</label><select id="shop-category"><option value="">All categories</option>' +
      [...new Set(all.map(item => item.productClass))].sort().map(cat => '<option' + (storeCategory === cat ? ' selected' : '') + '>' + h(cat) + '</option>').join('') +
      '</select><label class="sr-only" for="shop-search">Search collection</label><input type="search" id="shop-search" placeholder="Search collection" value="' + h(storeSearch) + '"></div><div id="shop-grid" class="shop-grid"></div>' :
      '<section class="empty-store"><h2>Your collection is waiting.</h2><p>Publish a product in the catalogue CMS to see its image, price and sizes here.</p><a class="button primary" href="#cms">Open catalogue CMS ↗</a></section>');
  if (all.length) filterStore();
}

function detail(id, size) {
  const item = records.get(id)?.live;
  if (!item) {
    main.innerHTML = '<section class="empty-store"><h1>Product unavailable</h1><p>This product has not been published in this browser.</p><a class="textlink" href="#store">Back to the collection</a></section>'; return;
  }
  const selectedSize = item.sizes.includes(size) ? size : item.sizes[0];
  const index = item.sizes.indexOf(selectedSize), qty = item.stock[index];
  const variants = liveItems().filter(p => p.styleCode === item.styleCode);
  main.innerHTML = '<div class="crumb"><a href="#store">Collection</a> <span>/</span> ' + h(item.productClass) + '</div><section class="pdp"><div class="pdp-photo">' +
    imageTag(item.imageUrl, item.title) + '</div><div class="pdp-info"><p class="eyebrow">' + h(item.division) + ' / ' + h(item.productClass) + '</p><h1>' +
    h(item.title) + '</h1><div class="pdp-price">' + price(item) + ' <small>AUD</small></div><div class="pdp-options"><strong>Colour</strong> <span>' + h(item.colour) + '</span>' +
    '<div class="swatches">' + variants.map(p => {
      const hex = data.colours.find(c => String(c.code) === String(p.colourCode))?.hex ?? '#bbb';
      return '<a href="#product/' + p.id + '/' + encodeURIComponent(p.sizes.includes(selectedSize) ? selectedSize : p.sizes[0]) + '" aria-label="' + h(p.colour) +
        '" title="' + h(p.colour) + '" class="swatch' + (item.id === p.id ? ' active' : '') + '"' + (p.id === item.id ? ' aria-current="true"' : '') + ' style="--swatch:' + h(hex) + '"></a>';
    }).join('') + '</div><strong>Size</strong> <span>' + h(selectedSize) + '</span><div class="sizes">' + item.sizes.map(s =>
      '<a href="#product/' + item.id + '/' + encodeURIComponent(s) + '"' + (s === selectedSize ? ' class="active" aria-current="true"' : '') + '>' + h(s) + '</a>').join('') + '</div></div>' +
    '<p class="stock-line"><span class="stock-dot' + (qty === 0 ? ' out' : '') + '"></span>' + (qty > 0 ? count(qty, 'unit') + ' in stock' : 'Out of stock') + '</p>' +
    '<dl class="product-data"><div><dt>Size SKU</dt><dd>' + h(item.skus[index]) + '</dd></div><div><dt>Style / colour</dt><dd>' + h(item.styleColour) +
    '</dd></div><div><dt>Department</dt><dd>' + h(item.department) + '</dd></div><div><dt>Activity</dt><dd>' + h(item.activity) + '</dd></div></dl>' +
    '<a class="textlink" href="#cms/' + id + '">Edit this product in the CMS ↗</a></div></section>';
}

function route() {
  const [view, id, size] = location.hash.slice(1).split('/');
  const isCMS = !['store','product'].includes(view);
  for (const [id, active] of [['nav-cms', isCMS], ['nav-store', !isCMS]]) {
    const link = document.getElementById(id);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (isCMS) {
    const editing = !!document.querySelector('#editor');
    const next = byId.get(id) ?? selected ?? data.rows[0];
    if (next !== selected) validated = false;
    selected = next;
    cms();
    if (!editing) scrollTo(0, 0);
  } else {
    if (view === 'store') storefront(); else detail(id, size);
    scrollTo(0, 0);
  }
  document.title = (isCMS ? 'Weekly drop' : (view === 'store' ? 'New arrivals' : records.get(id)?.live?.title || 'Product')) + ' · Hem & Vale';
}
document.querySelector('.skip').addEventListener('click', event => {
  event.preventDefault();
  main.focus();
});
main.addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action) handleAction(action);
});
main.addEventListener('submit', event => {
  event.preventDefault();
  if (event.target.id === 'entry-form') handleAction('publish');
});
main.addEventListener('input', event => {
  const el = event.target;
  if (el.id === 'find-row') { search = el.value; queue(); }
  else if (el.id === 'shop-search') { storeSearch = el.value; filterStore(); }
  else if (el.form?.id === 'entry-form' && el.name) {
    const saved = records.get(selected.id);
    const review = selected.review.includes(el.name) ? false : saved?.reviewed;
    if (!review && document.querySelector('#reviewed')) document.querySelector('#reviewed').checked = false;
    saveEdits(!!review);
    el.removeAttribute('aria-invalid');
    el.closest('label').classList.remove('invalid');
    el.closest('label').querySelector('small').textContent = derived[el.name] || 'Sheet · ' + (display(selected.raw[el.name]) || '(blank)');
    refreshSidebar();
    document.querySelector('.edit-heading .badge').outerHTML = badge(status(selected));
    if (el.name === 'imageUrl') {
      const img = imageTag(el.value, 'Current image for ' + selected.clean.styleName);
      document.querySelector('.edit-image').innerHTML = img;
      const comparison = document.querySelector('.compare figure');
      if (comparison) comparison.innerHTML = img + '<figcaption>Entered image</figcaption>';
    }
  }
});
main.addEventListener('change', event => {
  const el = event.target;
  if (el.id === 'status-filter') { filter = el.value; queue(); }
  if (el.id === 'shop-category') { storeCategory = el.value; filterStore(); }
  if (el.id === 'reviewed') {
    saveEdits(el.checked); refreshSidebar();
    document.querySelector('.edit-heading .badge').outerHTML = badge(status(selected));
  }
});
window.addEventListener('storage', event => {
  if (!records || !event.key?.startsWith(storagePrefix)) return;
  const id = event.key.slice(storagePrefix.length);
  const saved = readRow(id);
  if (saved) records.set(id, saved); else records.delete(id);
  route();
});
async function start() {
  try {
    const response = await fetch('./data.json');
    if (!response.ok) throw new Error('Could not load the workshop data.');
    data = await response.json();
    tables = referenceTables(data);
    byId = new Map(data.rows.map(row => [row.id, row]));
    storagePrefix = 'hem-vale:catalogue:' + data.version + ':';
    records = new Map(data.rows.map(row => [row.id, readRow(row.id)]).filter(([,record]) => record));
    window.addEventListener('hashchange', route);
    route();
  } catch (error) {
    main.innerHTML = '<div class="empty-store"><h1>Workspace unavailable</h1><p>Open the workshop over HTTP and enable browser storage, then reload.</p><p>' + h(error.message) + '</p></div>';
  }
}
start();
