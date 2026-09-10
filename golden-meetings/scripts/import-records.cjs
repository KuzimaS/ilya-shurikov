/* node scripts/import-records.cjs source-records.json [state.json]
 * Вход: полные атомы выгрузки за указанные даты, включая незачтённые строки.
 * Поля: type assigned|held, date YYYY-MM-DD, name, lead, meeting,
 * created (назначения), time (проведения), qualified boolean.
 * Исходные ID клиентов не сохраняются в публичном файле.
 */
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path'),assert=require('node:assert/strict');
const base=path.join(__dirname,'..'),ctx={window:{},Set,Date,console};vm.createContext(ctx);
for(const f of ['contest-data.js','contest-core.js'])vm.runInContext(fs.readFileSync(path.join(base,f),'utf8'),ctx);
const C=ctx.window.Contest,source=JSON.parse(fs.readFileSync(process.argv[2],'utf8')),target=process.argv[3]||path.join(base,'state.json'),raw=JSON.parse(fs.readFileSync(target,'utf8')),old=C.normalize(raw);
const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),norm=s=>s.toLowerCase().replaceAll('ё','е').trim().split(/\s+/).sort().join(' ');
const sourceDates={assigned:new Set(),held:new Set()},incoming={assigned:[],held:[]};
for(const r of source){
 assert.ok(['assigned','held'].includes(r.type));assert.ok(/^2026-09-\d{2}$/.test(r.date)&&r.date>=C.period.start&&r.date<=C.period.end);sourceDates[r.type].add(r.date);
 const p=C.people.find(p=>norm(p.name)===norm(r.name));if(!p)continue;
 if(r.type==='held'){assert.equal(typeof r.qualified,'boolean');if(!r.qualified)continue;}
 assert.match(String(r.lead),/^\d+$/);assert.match(String(r.meeting),/^\d+$/);
 const stamp=r.type==='assigned'?r.created:r.time,clock=stamp?.match(/(?:T|,\s*)(\d{2}:\d{2}:\d{2})/);assert.ok(clock,'Нет времени события: '+r.name);
 incoming[r.type].push({id:hash(C.contestId+':'+String(r.meeting).replace(/^0+(?=\d)/,'')),clientKey:hash(C.contestId+':client:'+String(r.lead).replace(/^0+(?=\d)/,'')),personId:p.id,date:r.date,occurredAt:r.date+'T'+clock[1]+'+03:00'});
}
// Первая миграция требует все старые назначения и все ID старых проведений.
if(!old.assignedEvents){const coverage=C.assignedCounts(incoming.assigned);for(const p of C.people)for(let i=6;i<30;i++)assert.ok(coverage[p.id][i]>=old.assigned[p.id][i],'Нужна полная история назначений: '+p.name);}
for(const e of old.heldEvents)if(!e.clientKey)assert.ok(incoming.held.some(r=>r.id===e.id),'Нужна исходная запись проведённой встречи');
const rejected=[];
const overrides=JSON.parse(fs.readFileSync(path.join(base,'attribution-overrides.json'),'utf8'));
assert.ok(Array.isArray(overrides));
const overrideKeys=new Set();
for(const o of overrides){
 assert.ok(['assigned','held'].includes(o.kind));assert.match(o.clientKey,/^[a-f0-9]{64}$/);assert.match(o.preferredEventId,/^[a-f0-9]{64}$/);
 assert.ok(C.people.some(p=>p.id===o.personId));assert.ok(o.date>=C.period.start&&o.date<=C.period.end);
 const key=o.kind+':'+o.clientKey;assert.ok(!overrideKeys.has(key),'Дубли ручных решений');overrideKeys.add(key);
}
function merge(kind,previous){
 let rows=[...previous.filter(e=>!sourceDates[kind].has(e.date)),...incoming[kind]];
 for(const o of overrides.filter(o=>o.kind===kind)){
  const matches=rows.filter(e=>e.clientKey===o.clientKey);if(!matches.length)continue;
  assert.ok(matches.some(e=>e.id===o.preferredEventId&&e.personId===o.personId&&e.date===o.date),'В выгрузке нет встречи, выбранной ручным решением: '+o.personId+' '+o.date);
  rows=rows.filter(e=>{if(e.clientKey!==o.clientKey||e.id===o.preferredEventId)return true;rejected.push({type:kind,personId:e.personId,date:e.date,keptPersonId:o.personId,reason:'manual-attribution'});return false;});
 }
 rows.sort((a,b)=>(a.occurredAt||a.date).localeCompare(b.occurredAt||b.date)||a.id.localeCompare(b.id));
 const ids=new Set(),clients=new Map(),out=[];for(const e of rows){assert.ok(e.clientKey,'Нет клиента в старом журнале');const first=clients.get(e.clientKey);if(ids.has(e.id)||first){rejected.push({type:kind,personId:e.personId,date:e.date,keptPersonId:first?.personId,reason:ids.has(e.id)?'meeting':'client'});continue;}ids.add(e.id);clients.set(e.clientKey,e);out.push(e);}return out;
}
const state={...old,assignedEvents:merge('assigned',old.assignedEvents||[]),heldEvents:merge('held',old.heldEvents)};state.assigned=C.assignedCounts(state.assignedEvents);const valid=C.validateForPublish(state);valid.updatedAt=C.signature(valid)===C.signature(old)?old.updatedAt:new Date().toISOString();delete valid.held;
fs.writeFileSync(target,JSON.stringify(valid,null,2)+'\n');console.log(JSON.stringify({summary:C.summary(C.normalize(valid)),rejected},null,2));
