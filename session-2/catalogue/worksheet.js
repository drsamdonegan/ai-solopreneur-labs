// Read the actual Excel file. Only the blank CMS Import sheet is editable.
const byId = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const elements = (node,tag) => Array.from(node.getElementsByTagNameNS(ns,tag));
const parse = text => new DOMParser().parseFromString(text,'application/xml');
const tabs = new Map(), draftKey='weekly-drop:cleaned-sheet:v1';
let zip, workingSheetPath, headers, drafts, active;
function columnIndex(ref) { return [...ref.match(/^[A-Z]+/)[0]].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1; }
async function openWorkbook() {
  const response=await fetch('weekly-drop.xlsx'); if(!response.ok) throw Error('Workbook unavailable.');
  zip=await JSZip.loadAsync(await response.arrayBuffer());
  const xml=async path=>parse(await zip.file(path).async('string'));
  const strings=elements(await xml('xl/sharedStrings.xml'),'si').map(el=>el.textContent);
  const relations=Array.from((await xml('xl/_rels/workbook.xml.rels')).documentElement.children);
  for(const entry of elements(await xml('xl/workbook.xml'),'sheet')){
    const name=entry.getAttribute('name'), rel=entry.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    const target=relations.find(r=>r.getAttribute('Id')===rel).getAttribute('Target');
    const path=target.startsWith('/')?target.slice(1):'xl/'+target;
    const rows=elements(await xml(path),'row').map(row=>{
      const values=[];
      for(const c of elements(row,'c')){
        const v=elements(c,'v')[0]?.textContent || '', t=c.getAttribute('t');
        values[columnIndex(c.getAttribute('r'))]=t==='s'?strings[Number(v)]:t==='inlineStr'?elements(c,'is')[0].textContent:v;
      }
      return values;
    });
    tabs.set(name,rows);
    if(name==='CMS Import'){workingSheetPath=path;headers=rows[0];}
  }
  drafts=JSON.parse(localStorage.getItem(draftKey)||'[]');
  byId('sheets').innerHTML=[...tabs.keys()].map(n=>'<button>'+esc(n)+'</button>').join('');
  byId('sheets').onclick=e=>{if(e.target.matches('button'))show(e.target.textContent);};show('Weekly Drop');
}
function persist(){localStorage.setItem(draftKey,JSON.stringify(drafts));}
function show(name){
  active=name; const editing=name==='CMS Import', raw=tabs.get(name), keys=editing?headers:raw.find(row=>row.filter(Boolean).length>1);
  const data=editing?drafts:raw.slice(raw.indexOf(keys)+1);
  for(const b of byId('sheets').children)b.setAttribute('aria-pressed',String(b.textContent===name));
  byId('tools').hidden=!editing;
  const caption=editing?'Place the hero skirts first, then higher-priced apparel, then accessories. Group each row by item type and related colours.':raw[1][0];
  byId('content').innerHTML='<p class="summary">'+esc(caption)+'</p><div class="sheet"><table aria-label="'+esc(name)+'"><thead><tr><th>#</th>'+keys.map(k=>'<th scope="col">'+esc(k)+'</th>').join('')+'</tr></thead><tbody>'+data.map((row,i)=>'<tr><th scope="row">'+(i+1)+'</th>'+keys.map((k,j)=>{
    const value=row[j]??'';
    if(editing)return '<td><input data-r="'+i+'" data-c="'+j+'" aria-label="'+esc(k)+' row '+(i+1)+'" value="'+esc(value)+'"></td>';
    return '<td>'+(/^https:\/\//.test(value)?'<a target="_blank" rel="noopener" href="'+esc(value)+'">'+esc(value)+'</a>':esc(value))+'</td>';
  }).join('')+'</tr>').join('')+'</tbody></table></div>';
  byId('status').textContent=data.length+' rows';
}
byId('content').addEventListener('input',e=>{if(!e.target.matches('input'))return;drafts[e.target.dataset.r][e.target.dataset.c]=e.target.value;persist();});
byId('clear').onclick=()=>{
  if(!drafts.length || !window.confirm('Clear this browser’s working sheet? Download a copy first if you want to keep these edits.'))return;
  drafts=[];persist();show(active);
};
byId('add').onclick=()=>{drafts.push(headers.map(()=>''));persist();show(active);byId('content').querySelector('tr:last-child input')?.focus();};
byId('bulk').onclick=()=>{byId('tsv').value='';byId('error').textContent='';byId('paste').showModal();};
byId('cancel').onclick=()=>byId('paste').close();
byId('append').onclick=()=>{
  const rows=byId('tsv').value.replace(/\r\n/g,'\n').split('\n').filter(s=>s.trim()).map(s=>s.split('\t'));
  if(rows[0]?.join('\t')===headers.join('\t'))rows.shift();
  if(!rows.length || rows.some(r=>r.length!==headers.length)){byId('error').textContent='Each product needs '+headers.length+' tab-separated cells in the order shown.';return;}
  drafts.push(...rows);persist();byId('paste').close();show(active);
};
byId('copy').onclick=async()=>{
  const text=[headers,...drafts.filter(row=>row.some(Boolean))].map(r=>r.join('\t')).join('\n');
  try{await navigator.clipboard.writeText(text);byId('status').textContent='Header and worksheet rows copied for the CMS.';}
  catch{byId('bulk').click();byId('tsv').value=text;byId('tsv').select();byId('error').textContent='Press Ctrl+C or ⌘C to copy, then Cancel.';}
};
byId('export').onclick=async()=>{
  const doc=parse(await zip.file(workingSheetPath).async('string')), data=elements(doc,'sheetData')[0];
  while(data.children.length>1)data.lastElementChild.remove();
  drafts.filter(r=>r.some(Boolean)).forEach((row,i)=>{
    const el=doc.createElementNS(ns,'row');el.setAttribute('r',i+2); data.append(el);
    row.forEach((v,j)=>{const c=doc.createElementNS(ns,'c'), inline=doc.createElementNS(ns,'is'),t=doc.createElementNS(ns,'t');
      c.setAttribute('r',String.fromCharCode(65+j)+(i+2));c.setAttribute('t','inlineStr');t.textContent=v;
      inline.append(t);c.append(inline);el.append(c);});
  });
  elements(doc,'dimension')[0]?.setAttribute('ref','A1:Y'+data.children.length);
  zip.file(workingSheetPath,new XMLSerializer().serializeToString(doc));
  const url=URL.createObjectURL(await zip.generateAsync({type:'blob',compression:'DEFLATE',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const a=document.createElement('a');a.href=url;a.download='weekly-drop-edited.xlsx';a.click();byId('status').textContent='Edited workbook prepared for download.';setTimeout(()=>URL.revokeObjectURL(url),30000);
};
openWorkbook().catch(e=>{byId('content').textContent='Could not open the workbook: '+e.message;});
