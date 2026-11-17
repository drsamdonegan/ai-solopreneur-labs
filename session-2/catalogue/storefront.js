// The collection, swatches and product details all read the CMS's live snapshots.
const escape = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));
const urlPart = value => escape(encodeURIComponent(value));
const productLink = (item, size = item.sizes?.[0] || '') => '#product/' + urlPart(item.id) + '/' + urlPart(size);
const priceFormat = new Intl.NumberFormat('en-AU', {minimumFractionDigits: 0, maximumFractionDigits: 2});
const aud = number => 'A$' + (Number.isInteger(Number(number)) ? priceFormat.format(number) : Number(number).toFixed(2));
const names = {
  'New & Featured': "What’s New", Women: "Women’s What’s New", Men: "Men’s What’s New",
  Kids: 'Kids', Baby: 'Baby', Accessories: 'Accessories', Bags: 'Bags', 'We Made Too Much': 'We Made Too Much',
  Bestsellers: 'Bestsellers', 'Shop Groove': 'Shop Groove', 'Shop T-Shirts': 'T-Shirts', 'Shop Shorts': 'Shorts',
  Favourites: 'Your favourites'
};
const navigation = ['Women', 'Men', 'Kids', 'Baby'];
const iconPaths = {
  search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5.5 5.5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  user: '<circle cx="12" cy="7.5" r="3.5"/><path d="M3.8 21a8.2 8.2 0 0 1 16.4 0"/>',
  bag: '<path d="M2 3h3l2.4 13h12.1L22 6H5.6"/><circle cx="9" cy="21" r="1"/><circle cx="19" cy="21" r="1"/>',
  heart: '<path d="M12 21S2 14.4 2 8.4a5.1 5.1 0 0 1 10-1.5 5.1 5.1 0 0 1 10 1.5C22 14.4 12 21 12 21Z"/>',
  filter: '<path d="M2 5h20M5.5 12h13M9 19h6"/>',
  large: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 3v18"/>',
  dense: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>', menu: '<path d="M2 6h20M2 12h20M2 18h20"/>',
  left: '<path d="M21 12H3m7-7-7 7 7 7"/>', right: '<path d="M3 12h18m-7-7 7 7-7 7"/>'
};
const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + iconPaths[name] + '</svg>';
const listing = {nav: 'New & Featured', query: '', category: '', colour: '', size: '', activity: '', sort: 'featured', dense: false};
let bannerDismissed = false;
const favouritesKey = 'workshop:storefront:favourites:1';
function savedFavourites() {
  try { const ids = JSON.parse(localStorage.getItem(favouritesKey) || '[]'); return new Set(Array.isArray(ids) ? ids : []); }
  catch { return new Set(); }
}
const favouriteIds = savedFavourites();

function photoUrls(item, asset) {
  const images = [item.imageUrl, item.imageUrl2, ...(Array.isArray(item.gallery) ? item.gallery : [])];
  return [...new Set(images.filter(Boolean).map(asset).filter(Boolean))];
}
function price(item) {
  return item.salePrice == null || item.salePrice === '' ? aud(item.price)
    : '<span class="sf-sale">' + aud(item.salePrice) + '</span> <del>' + aud(item.price) + '</del>';
}
function galleryVariants(item, items) {
  const groupIds = item.referenceGroups || (item.collectionGroup ? [item.collectionGroup] : []);
  return items.filter(p => p.id === item.id || (item.styleCode && p.styleCode === item.styleCode) ||
    groupIds.some(group => (p.referenceGroups || [p.collectionGroup]).includes(group)));
}
function swatchColour(item, colours) {
  const hex = item.colourHex || colours.find(c => String(c.code) === String(item.colourCode))?.hex;
  if (typeof hex === 'string' && /^#[\da-f]{3,8}$/i.test(hex)) return hex;
  const colour = String(item.colour || '').trim();
  if (/^[a-z]+$/i.test(colour) && CSS.supports('color', colour)) return colour;
  return '#cecbc6';
}
function toggle(name, label) {
  return '<button type="button" data-sf="' + name + '" class="sf-iconbutton" aria-label="' + escape(label) + '" title="' + escape(label) + '">' + icon(name) + '</button>';
}
function navLinks() {
  return navigation.map(n => '<a href="#store" data-section="' + escape(n) + '">' + escape(n) + '</a>').join('');
}
function shell() {
  return (!bannerDismissed ? '<div class="sf-announcement">Workshop storefront. <a href="#cms">Edit this collection in the CMS</a><button type="button" data-sf="hide-banner" aria-label="Dismiss announcement">' + icon('close') + '</button></div>' : '') +
    '<header class="sf-header"><a href="#store" data-section="New &amp; Featured" class="sf-logo" aria-label="UNIQLO workshop collection home"><img src="reference/uniqlo-logo.png" alt="UNIQLO" width="64" height="64"></a>' +
    '<nav class="sf-navigation" aria-label="Shop departments">' + navLinks() + '</nav><div class="sf-tools">' +
    '<button type="button" data-sf="search" aria-label="Search products">' + icon('search') + '</button>' + toggle('heart','View favourites') +
    '<a href="#cms" title="Open workshop CMS" aria-label="Open workshop CMS">' + icon('user') + '</a>' + toggle('bag','Shopping bag') +
    '<button type="button" data-sf="menu" class="sf-menu-toggle" aria-label="Browse departments">' + icon('menu') + '</button></div></header>';
}
function tail() {
  return '<div class="sf-foot"><span>Workshop storefront</span><a href="#cms">Open catalogue CMS</a><a href="../#slide-17">Workshop slides</a></div>' +
    '<dialog class="sf-sheet" aria-labelledby="sf-sheet-title"><div class="sf-sheet-head"><h2 id="sf-sheet-title"></h2>' + toggle('close','Close panel') + '</div><div class="sf-sheet-body"></div></dialog>';
}
function matchesNav(item, selection) {
  const category = [item.category, item.productClass, item.styleName, item.title].join(' ').toLowerCase();
  switch (selection) {
    case 'Women': return /women|unisex/i.test(item.division);
    case 'Men': return /^(men|mens|men.s|unisex)$/i.test(String(item.division));
    case 'Kids': return /^(kids|children|girls|boys)$/i.test(String(item.division));
    case 'Baby': return /^(baby|babies|infants)$/i.test(String(item.division));
    case 'Accessories': return /accessor|bag|sock|hat|bottle|belt/i.test(category + ' ' + item.department);
    case 'Bags': return /bag|tote|backpack|pouch|satchel/.test(category);
    case 'We Made Too Much': return item.salePrice != null && item.salePrice !== '';
    case 'Bestsellers': return /best\s*seller/i.test(item.badge || '');
    case 'Shop Groove': return /groove/.test(category);
    case 'Shop T-Shirts': return /t-shirt|tee\b|short.sleeve/.test(category);
    case 'Shop Shorts': return /\bshorts?\b/.test(category.replace(/short.sleeve/g,''));
    case 'Favourites': return favouriteIds.has(item.id);
    default: return true;
  }
}
function filtered(items) {
  const query = listing.query.trim().toLowerCase();
  const result = items.filter(item => matchesNav(item,listing.nav)
    && (!listing.category || item.productClass === listing.category) && (!listing.colour || item.colour === listing.colour)
    && (!listing.activity || item.activity === listing.activity) && (!listing.size || item.sizes.includes(listing.size))
    && (!query || [item.title,item.styleName,item.styleCode,item.colour,item.category,...item.skus].join(' ').toLowerCase().includes(query)));
  const cards = result.sort((a,b) => Number(a.displayRow) - Number(b.displayRow)
    || Number(a.rowPosition) - Number(b.rowPosition) || a.id.localeCompare(b.id));
  if (listing.sort === 'asc' || listing.sort === 'desc') {
    const direction = listing.sort === 'asc' ? 1 : -1;
    cards.sort((a,b) => direction * ((a.salePrice ?? a.price) - (b.salePrice ?? b.price)));
  }
  return cards;
}
function cardSwatches(item, items, colours) {
  const variants = galleryVariants(item,items);
  const actual = new Map();
  for (const p of variants) {
    const key = String(p.colourCode);
    if (!actual.has(key) || p.id === item.id) actual.set(key,p);
  }
  const options = item.swatches?.length
    ? item.swatches.filter(opt=>actual.has(String(opt.colourCode)))
    : [];
  for (const p of variants) {
    if (!options.some(opt=>String(opt.colourCode)===String(p.colourCode))) options.push({name:p.colour,colourCode:p.colourCode});
  }
  const selected=options.findIndex(opt=>String(opt.colourCode)===String(item.colourCode));
  if (selected > 5) options.unshift(options.splice(selected,1)[0]);
  return '<div class="sf-card-swatches" role="group" aria-label="Product colours">' + options.slice(0,6).map(opt=>{
    const p=actual.get(String(opt.colourCode));
    const label = options.filter(other=>other.name===opt.name).length > 1 ? p.colour + ' (' + p.colourCode + ')' : p.colour;
    return '<button type="button" data-variant="' + escape(p.id) + '" style="--sf-swatch:' + swatchColour(p,colours) + '" aria-label="' + escape(label) +
      '" title="' + escape(label) + '" aria-pressed="' + (p.id === item.id) + '"></button>';
  }).join('') + (options.length>6?'<a class="sf-more-colours" href="' + productLink(item) + '" aria-label="View all product colours">+' + (options.length-6) + '</a>':'') + '</div>';
}
function productCard(item, ctx) {
  const [first,second] = photoUrls(item,ctx.asset);
  const url = productLink(item);
  return '<article class="sf-card" data-card="' + escape(item.id) + '"><a class="sf-card-image" href="' + url + '" aria-label="' + escape(item.title) + '">' +
    (first ? '<img src="' + escape(first) + '" alt="' + escape(item.title) + '" loading="lazy">' : '') +
    (second ? '<img class="sf-card-alt" src="' + escape(second) + '" alt="" loading="lazy">' : '') +
    (item.badge ? '<span class="sf-badge">' + escape(item.badge) + '</span>' : '') + '</a><div class="sf-card-info">' +
    cardSwatches(item,ctx.items,ctx.colours) + '<div class="sf-card-title"><h2><a href="' + url + '">' + escape(item.title) + '</a></h2>' +
    '<button type="button" data-fav="' + escape(item.id) + '" aria-pressed="' + favouriteIds.has(item.id) + '" aria-label="Save ' + escape(item.title) + ' to favourites">' + icon('heart') + '</button></div>' +
    '<div class="sf-card-details"><span>' + escape(item.colour) + '</span><span>' + price(item) + '</span></div></div></article>';
}
function updateProducts(ctx) {
  const result = filtered(ctx.items);
  const grid = ctx.main.querySelector('#sf-products');
  if (!grid) return;
  grid.classList.toggle('sf-dense', listing.dense);
  let content;
  if (listing.sort === 'featured') {
    const shelves = new Map();
    for (const item of result) {
      if (!shelves.has(item.displayRow)) shelves.set(item.displayRow, []);
      shelves.get(item.displayRow).push(item);
    }
    content = [...shelves].map(([row,items]) => {
      const types = [...new Set(items.map(p=>p.productClass).filter(Boolean))].join(' & ');
      const colours = [...new Set(items.map(p=>p.colour).filter(Boolean))].join(' · ');
      const feature = items.every(p=>p.badge === 'New') ? 'New arrivals' : 'Collection';
      return '<section class="sf-shelf" aria-label="Display row ' + escape(row) + '"><header class="sf-shelf-label"><small>' +
        feature + ' / ' + escape(String(row).padStart(2,'0')) + '</small><h2>' + (escape(types) || 'Products') + '</h2><p>' +
        escape(colours) + '</p></header><div class="sf-shelf-cards" style="--items:' + items.length + '">' +
        items.map(item => productCard(item,ctx)).join('') + '</div></section>';
    }).join('');
  } else content = result.map(item => productCard(item,ctx)).join('');
  const empty = ctx.items.length === 0
    ? '<div class="sf-no-results"><h2>Your storefront is empty</h2><p>Publish a product in the CMS to display it here.</p><a class="sf-solid" href="#cms">Open catalogue CMS</a></div>'
    : '<div class="sf-no-results"><h2>No products found</h2><button type="button" data-sf="reset">Show all products</button></div>';
  grid.innerHTML = content || empty;
  ctx.main.querySelector('#sf-result-count').textContent = String(result.length);
  ctx.main.querySelector('#sf-heading').textContent = listing.query ? 'Search results' : names[listing.nav];
  const count = 1 + ['category','colour','size','activity'].filter(k => listing[k]).length;
  const filterCount = ctx.main.querySelector('#sf-filter-count');
  if (filterCount) { filterCount.textContent = String(count); filterCount.hidden = !count; }
  ctx.main.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === (listing.dense ? 'dense' : 'large'))));
}
function toolbar() {
  return '<div class="sf-toolbar" role="group" aria-label="Collection controls"><div class="sf-view">View' +
    '<button type="button" aria-label="Large product images" data-view="large">' + icon('large') + '</button><button type="button" aria-label="Compact product images" data-view="dense">' + icon('dense') + '</button></div>' +
    '<button type="button" class="sf-filter-button" data-sf="filter" aria-label="Filter and sort products">' + icon('filter') + '<small id="sf-filter-count" hidden></small></button></div>';
}
function scrollToProducts(main) {
  main.querySelector('#sf-products')?.scrollIntoView({block:'start'});
}
function section(name, ctx) {
  if (name === 'Activity') { openPanel('filter',ctx); return; }
  Object.assign(listing,{nav:name, query:'', category:'', colour:'', size:'', activity:''});
  if (location.hash !== '#store') { location.hash = 'store'; return; }
  updateProducts(ctx);
  if (name === 'New & Featured') window.scrollTo(0,0); else scrollToProducts(ctx.main);
}
function panelField(label, field, values) {
  const options = [...new Set(values.filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'en', {numeric:true}));
  return '<label>' + label + '<select name="' + field + '"><option value="">All</option>' +
    options.map(v=>'<option value="' + escape(v) + '"' + (listing[field] === v ? ' selected' : '') + '>' + escape(v) + '</option>').join('') + '</select></label>';
}
function openPanel(which,ctx) {
  const {main,items}=ctx, dialog=main.querySelector('.sf-sheet'), content=dialog.querySelector('.sf-sheet-body');
  const title=dialog.querySelector('h2'); dialog.dataset.panel=which;
  if (dialog.open) dialog.close();
  if (which === 'filter') {
    title.textContent = 'Filter & sort';
    content.innerHTML = '<form class="sf-controls-form"><p class="sf-current-collection">' + escape(names[listing.nav]) + '</p><label>Sort by<select name="sort">' +
      [['featured','Featured'],['asc','Price: low to high'],['desc','Price: high to low']].map(([key,text])=>'<option value="' + key + '"' + (listing.sort === key?' selected':'') + '>' + text + '</option>').join('') +
      '</select></label>' + panelField('Category','category',items.map(p=>p.productClass)) + panelField('Colour','colour',items.map(p=>p.colour)) +
      panelField('Size','size',items.flatMap(p=>p.sizes)) + panelField('Activity','activity',items.map(p=>p.activity)) +
      '<button class="sf-solid" type="submit">View products</button><button type="button" data-sf="reset">Clear all filters</button></form>';
  } else if (which === 'bag') {
    title.textContent = 'Your shopping bag';
    content.innerHTML = '<p>Your bag is empty.</p><button type="button" class="sf-solid" data-sf="close">Continue browsing</button>';
  } else if (which === 'search') {
    title.textContent = 'Search'; content.innerHTML = '<form class="sf-controls-form"><label>Search products<input type="search" name="query" placeholder="Product name, colour or SKU" value="' + escape(listing.query) + '"></label><button class="sf-solid">Search collection</button></form>';
  } else if (which === 'location') {
    title.textContent='Australia (AUD)'; content.innerHTML = '<p>All prices in this workshop collection are in Australian dollars.</p>';
  } else if (which === 'menu') {
    title.textContent='Shop'; content.innerHTML='<div class="sf-menu-links">' + navLinks() + '<a href="#store" data-section="Favourites">Favourites</a><a href="#cms">Open workshop CMS</a></div>';
  } else return;
  dialog.showModal(); (content.querySelector('input') || dialog.querySelector('button'))?.focus();
}
function bind(ctx) {
  const {main,items}=ctx;
  const root=main.querySelector('.sf-page');
  root.addEventListener('click',event=>{
    const control=event.target.closest('a,button');
    if (!control) return;
    const dialog=main.querySelector('.sf-sheet');
    if(control.dataset.section) {
      event.preventDefault(); if(dialog.open)dialog.close(); section(control.dataset.section,ctx); return;
    }
    if(control.dataset.variant) {
      const item=items.find(p=>p.id===control.dataset.variant);
      const card=control.closest('.sf-card');
      if (item && card) {
        const node=document.createElement('div'); node.innerHTML=productCard(item,ctx);
        const next=node.firstElementChild; card.replaceWith(next);
        [...next.querySelectorAll('[data-variant]')].find(b=>b.dataset.variant===item.id)?.focus({preventScroll:true});
      }
      return;
    }
    if(control.dataset.view) {listing.dense=control.dataset.view==='dense'; updateProducts(ctx); return;}
    if(control.dataset.scroll) {
      const rail=main.querySelector('.sf-feature-rail');
      rail.scrollBy({left:Number(control.dataset.scroll) * rail.firstElementChild.clientWidth,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'}); return;
    }
    if(control.dataset.fav) {
      const id=control.dataset.fav;
      if(favouriteIds.has(id)) favouriteIds.delete(id); else favouriteIds.add(id);
      try{localStorage.setItem(favouritesKey,JSON.stringify([...favouriteIds]));}catch{}
      control.setAttribute('aria-pressed',String(favouriteIds.has(id)));
      if(listing.nav==='Favourites')updateProducts(ctx);
      return;
    }
    const action=control.dataset.sf;
    if(action==='hide-banner') {bannerDismissed=true; control.parentElement.remove();}
    else if(action==='close') dialog.close();
    else if(action==='reset') {
      Object.assign(listing,{nav:'New & Featured',query:'',category:'',size:'',colour:'',activity:'',sort:'featured'});
      if(dialog.open)dialog.close();
      if(location.hash !== '#store')location.hash='store'; else {updateProducts(ctx); scrollToProducts(main);}
    }
    else if(action==='heart') section('Favourites',ctx);
    else if(action==='sku') {
      const specs=main.querySelector('.sf-specs');
      specs.open = true; specs.scrollIntoView({block:'center'});
      specs.querySelector('summary').focus({preventScroll:true});
    } else if(action)openPanel(action,ctx);
  });
  root.addEventListener('submit',event=>{
    if(!event.target.matches('.sf-controls-form')) return;
    event.preventDefault();
    const dialog=event.target.closest('dialog'), values=Object.fromEntries(new FormData(event.target));
    if(dialog.dataset.panel==='search') Object.assign(listing,{nav:'New & Featured',category:'',size:'',colour:'',activity:''});
    Object.assign(listing,values); dialog.close();
    if(location.hash!=='#store')location.hash='store'; else{updateProducts(ctx);scrollToProducts(main);}
  });
  const dialog=root.querySelector('dialog');
  dialog.addEventListener('click',event=>{if(event.target===dialog && (event.clientX<dialog.getBoundingClientRect().left || event.clientX>dialog.getBoundingClientRect().right))dialog.close();});
}
export function renderStorefront(ctx) {
  if (!ctx.main.querySelector('.sf-page')) {
    Object.assign(listing,{nav:'New & Featured',query:'',category:'',size:'',colour:'',activity:'',sort:'featured'});
  }
  ctx.main.innerHTML = '<div class="sf-page">' + shell() + '<div class="sf-crumb">What\'s New</div><div class="sf-collection-head"><h1 id="sf-heading"></h1><span id="sf-result-count" aria-label="Products"></span></div>' +
    '<section id="sf-products" aria-label="Collection products"></section>' + (ctx.items.length ? toolbar() : '') + tail() + '</div>';
  updateProducts(ctx); bind(ctx);

}
export function renderProduct(ctx) {
  const {main,id,size,items,asset,colours}=ctx, item=items.find(p=>p.id===id);
  if(!item) {
    main.innerHTML='<div class="sf-page">' + shell() + '<section class="sf-notfound"><h1>Product unavailable</h1><a href="#store">Back to the collection</a></section>' + tail() + '</div>';
    bind(ctx); return;
  }
  const chosen=item.sizes.includes(size)?size:item.sizes[0], index=item.sizes.indexOf(chosen), qty=item.stock[index];
  const photos=photoUrls(item,asset);
  const sizes=item.sizes.map(s=>'<a class="sf-size" ' + (s===chosen?'aria-current="true" ':'') + 'href="' + productLink(item,s) + '">' + escape(s) + '</a>').join('');
  const swatches=galleryVariants(item,items).map(p=>'<a style="--sf-swatch:' + swatchColour(p,colours) + '" aria-label="' + escape(p.colour) + '" title="' + escape(p.colour) +
    '" href="' + productLink(p,p.sizes.includes(chosen)?chosen:p.sizes[0]) + '"' + (p.id===item.id?' aria-current="true"':'') + '></a>').join('');
  const info=[['Size SKU',item.skus[index]],['Style / colour',item.styleColour],['Department',item.department],['Activity',item.activity]].filter(([,v])=>v);
  const crumb=[item.division, item.department, item.productClass].filter(Boolean).map(escape);
  main.innerHTML='<div class="sf-page">' + shell() +
    '<section class="sf-product"><div class="sf-product-gallery" aria-label="Product gallery" tabindex="0">' + photos.map((src,i)=>'<img src="' + escape(src) + '" alt="' + escape(item.title) + (i?' — alternate view':'') + '">').join('') +
    '</div><div class="sf-product-copy"><div class="sf-product-crumb"><a href="#store">What’s New</a> / ' + crumb.join(' / ') + '</div><h1>' + escape(item.title) + '</h1><p class="sf-product-price">' + price(item) + '</p><p><b>Colour</b> ' + escape(item.colour) + '</p><div class="sf-product-swatches">' + swatches + '</div>' +
    '<p><b>Select Size</b></p><div class="sf-sizes">' + sizes + '</div><p class="sf-stock">' + escape(chosen) + ' · ' + (qty>0?escape(qty)+' in stock':'Out of stock') + '</p>' +
    '<button type="button" class="sf-solid sf-show-sku" data-sf="sku"><span>View size SKU</span><span>' + price(item) + '</span></button>' +
    '<details class="sf-specs"><summary>Product details</summary>' + (item.description ? '<p class="sf-description">' + escape(item.description) + '</p>' : '') + '<dl>' + info.map(([label,value])=>'<div><dt>' + label + '</dt><dd>' + escape(value) + '</dd></div>').join('') +
    '</dl></details><a class="sf-edit" href="#cms/' + urlPart(item.id) + '">Edit this product in the CMS ↗</a></div></section>' + tail() + '</div>';
  bind(ctx);
}
