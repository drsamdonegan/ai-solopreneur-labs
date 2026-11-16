export const fieldGroups = [
  { name: 'Product identity', fields: [
    ['styleCode', 'Style code'], ['colourCode', 'Colour code'], ['styleColour', 'Style / colour key'],
    ['styleName', 'Style name'], ['colour', 'Colour'], ['title', 'Product title']
  ] },
  { name: 'Price & inventory', fields: [
    ['price', 'Regular price (AUD)'], ['salePrice', 'Sale price (AUD)'], ['sizes', 'Sizes'],
    ['stock', 'Stock by size'], ['skus', 'Size SKUs']
  ] },
  { name: 'Merchandising', fields: [
    ['division', 'Division'], ['department', 'Department'], ['productClass', 'Class'],
    ['category', 'Primary category'], ['activity', 'Activity']
  ] },
  { name: 'Source identifiers & image', fields: [
    ['pcmId', 'PDM product ID'], ['commerceId', 'Commerce ID'], ['globalId', 'Global ID'],
    ['imageStatus', 'Image status'], ['imageUrl', 'Image URL']
  ] }
];
export const fields = fieldGroups.flatMap(group => group.fields);
export const labels = Object.fromEntries(fields);

const compact = value => String(value ?? '').trim().replace(/\s+/g, ' ');
const code = value => compact(value).replace(/^0+(?=\d)/, '');
const normalText = value => compact(value).toLowerCase();
const arrayFields = new Set(['sizes', 'stock', 'skus']);
const moneyFields = new Set(['price', 'salePrice']);
export const pieces = value => String(value ?? '').split('|').map(compact).filter(Boolean);
export const display = value => Array.isArray(value) ? value.join(' | ') : String(value ?? '');
const parseMoney = value => {
  const cleaned = compact(value).replace(/^(?:AUD\s*)?\$?\s*/i, '').trim();
  return /^\d+(?:\.\d{1,2})?$/.test(cleaned) ? Number(cleaned) : null;
};

export function rawForm(row) {
  return Object.fromEntries(fields.map(([key]) => [key, display(row.raw[key])]));
}

export function referenceTables(data) {
  const keys = ['styleName','division','department','productClass','category','activity','imageStatus'];
  return Object.fromEntries(keys.map(key => [
    key, new Map(data.rows.map(row => [normalText(row.clean[key]), row.clean[key]]))
  ]));
}

// Apply repeatable supplier-feed rules. Any disagreement with the approved
// references stays visible in QA instead of being replaced with an answer key.
export function prepare(row, data, tables = referenceTables(data)) {
  const form = rawForm(row);
  for (const key of Object.keys(form)) form[key] = compact(form[key]);
  form.styleCode = code(form.styleCode);
  form.colourCode = code(form.colourCode);
  for (const [key, table] of Object.entries(tables)) {
    form[key] = table.get(normalText(form[key])) ?? form[key];
  }
  const palette = data.colours.find(item => String(item.code) === form.colourCode);
  if (palette && [palette.name, ...(palette.aliases ?? [])].some(name => normalText(name) === normalText(form.colour))) {
    form.colour = palette.name;
  }
  for (const key of moneyFields) {
    const amount = parseMoney(form[key]);
    if (amount !== null) form[key] = amount.toFixed(2);
  }
  const sizes = pieces(form.sizes).map(size => size.toUpperCase());
  form.sizes = display(sizes);
  form.stock = display(pieces(form.stock).map(qty => /^\d+$/.test(qty) ? Number(qty) : qty));
  form.styleColour = [form.styleCode, form.colourCode].join('_');
  form.title = [form.colour, form.styleName].join(' ');
  form.skus = display(sizes.map(size => form.styleColour + '_' + size));
  return form;
}

export function validate(row, form) {
  const errors = {};
  for (const [key] of fields) {
    const value = form[key] ?? '';
    const expected = row.clean[key];
    let valid;
    if (moneyFields.has(key)) {
      const amount = String(value).trim();
      valid = expected == null ? amount === '' : /^\d+(?:\.\d{1,2})?$/.test(amount) && Number(amount) === expected;
    } else if (arrayFields.has(key)) {
      const actual = String(value).split('|').map(part => part.trim());
      valid = actual.length === expected.length && actual.every((part, i) => part === String(expected[i]));
    } else {
      valid = String(value) === String(expected ?? '');
    }
    if (!valid) errors[key] = 'Expected ' + (display(expected) || 'a blank field');
  }
  return errors;
}
export function product(row, form) {
  return { id: row.id, ...form, price: Number(form.price), salePrice: form.salePrice === '' ? null : Number(form.salePrice),
    sizes: pieces(form.sizes), stock: pieces(form.stock).map(Number), skus: pieces(form.skus) };
}

export function imageSource(value, baseURL) {
  if (!String(value || '').trim()) return '';
  try {
    const url = new URL(value, baseURL);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

export function editorialForm(row, form) {
  const result = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, compact(value)]));
  result.styleCode = result.styleCode || row.id;
  result.colourCode = result.colourCode || '00';
  result.styleColour = [result.styleCode, result.colourCode].join('_');
  result.styleName = result.styleName || result.title;
  const sizes = pieces(result.sizes);
  result.sizes = display(sizes.length ? sizes : ['One Size']);
  result.skus = display(pieces(result.sizes).map(size => result.styleColour + '_' + size));
  result.stock = result.stock || display(pieces(result.sizes).map(() => 0));
  return result;
}

export function validateEditorial(form, baseURL) {
  const errors = {};
  if (!form.title) errors.title = 'Enter a product title.';
  const value = key => parseMoney(form[key]);
  if (value('price') == null) errors.price = 'Enter a price in AUD, e.g. 89.90.';
  if (form.salePrice && (value('salePrice') == null || value('salePrice') > value('price'))) {
    errors.salePrice = 'Enter a sale price up to the regular price.';
  }
  for (const key of ['imageUrl', 'imageUrl2']) {
    const source = form[key] || '';
    const isCatalogueAsset = /^(?:\.\/)?(?:reference|images)\/[\w.-]+\.(?:avif|webp|jpe?g|png)$/i.test(source);
    if ((key === 'imageUrl' || source) && (!imageSource(source, baseURL) || (!isCatalogueAsset && !/^https?:\/\//i.test(source)))) {
      errors[key] = 'Enter a full HTTP(S) image URL or a catalogue image path.';
    }
  }
  if (form.colourHex && !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(form.colourHex)) {
    errors.colourHex = 'Enter a hex colour, e.g. #945164.';
  }
  const sizes = pieces(form.sizes), stock = pieces(form.stock);
  if (new Set(sizes).size !== sizes.length) errors.sizes = 'Use each size once.';
  if (stock.length !== sizes.length || stock.some(v => !/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)))) {
    errors.stock = 'Enter one whole-number stock quantity per size, separated by |.';
  }
  return errors;
}
