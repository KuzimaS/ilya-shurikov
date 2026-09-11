/* Запуск: node golden-meetings/checks.cjs */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{},Set,Date,console};vm.createContext(context);
for(const file of ['contest-data.js','contest-core.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+file,'utf8'),context);
const C=context.window.Contest,id=C.people[0].id;
for(const [n,p] of [[0,0],[2,0],[3,10000],[4,10000],[5,20000],[6,20000],[7,35000],[8,35000],[9,45000],[11,45000],[12,60000],[14,60000],[15,70000],[30,70000]])assert.equal(C.reward(n),p);
const s=C.empty();s.assigned[id][6]=4;s.assigned[id][29]=6;assert.equal(C.bonus(s.assigned[id]),4000);
assert.equal(C.rank([5,5,3,0],5),1);assert.equal(C.rank([5,5,3,0],3),3);assert.equal(C.rank([0,0],0),null);
assert.ok(Math.abs(C.progress(3)-100/6)<1e-9);assert.equal(C.progress(7),50);assert.equal(C.progress(15),100);
for(let i=0;i<6;i++)s.heldEvents.push({personId:id,date:'2026-09-07',id:String(i).padStart(64,'0')});
const valid=C.normalize(s);assert.equal(valid.held[id],6);assert.equal(C.summary(valid).money,24000);
assert.equal(C.reward(0)+C.reward(6),20000);assert.equal(C.reward((0+6)/2)*2,20000);
assert.throws(()=>C.normalize({...s,contestId:'other'}));assert.throws(()=>C.normalize({}));assert.throws(()=>C.count(3.5));assert.throws(()=>C.count(-1));
assert.throws(()=>C.normalize({...s,heldEvents:[s.heldEvents[0],s.heldEvents[0]]}));
assert.throws(()=>C.normalize({...s,heldEvents:[{...s.heldEvents[0],date:'2026-09-06'}]}));
assert.throws(()=>C.normalize({...s,heldEvents:[{...s.heldEvents[0],personId:'missing'}]}));
const legacy=C.normalize({assigned:{},held:{[id]:7}},{legacy:true});assert.equal(legacy.unverifiedHeld[id],7);assert.equal(legacy.held[id],7);
for(const name of ['index.html','tv-assigned.html','tv-held.html','tv-top10.html']){const html=fs.readFileSync(__dirname+'/'+name,'utf8');for(const [,script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(script);for(const [,path] of html.matchAll(/<script src="\.\/([^"?]+)/g))assert.ok(fs.existsSync(__dirname+'/'+path));}
assert.equal(C.people.length,39);assert.equal(new Set(C.people.map(p=>p.id )).size,39);
C.normalize(JSON.parse(fs.readFileSync(__dirname+'/state.json','utf8')));
console.log('PASS: выплаты, даты, дубли, импорт, миграция, места, прогресс, 39 участников и синтаксис страниц');

assert.equal(C.milestones.length,6);assert.equal(C.next(3).n,5);assert.equal(C.next(5).n,7);

const previous=JSON.parse(fs.readFileSync(__dirname+'/state.json','utf8'));previous.assigned['vlasov-nikita']=Array(30).fill(0);previous.assigned['vlasov-nikita'][6]=5;previous.heldEvents.push({personId:'vlasov-nikita',date:'2026-09-07',id:'e'.repeat(64)});
const migrated=C.normalize(previous);assert.equal(JSON.stringify(C.summary(migrated)),JSON.stringify(C.summary(C.normalize(JSON.parse(fs.readFileSync(__dirname+'/state.json','utf8'))))));assert.equal(Object.keys(migrated.assigned).length,39);
assert.equal(C.departments.length,6);assert.equal(C.scope('dept:Отдел Ерёменкова'),'all');assert.equal(C.scope('dept:ОП-4 · Демидова'),'dept:ОП-4 · Демидова');
assert(!C.people.some(p=>['Власов Никита','Сметанкина Римма','Конвисар Дарья','Фрейман Елена'].includes(p.name)));assert.equal(C.people.find(p=>p.id==='amelchenko-sergey').dept,'Инвестиционный отдел');
console.log('PASS: состав, перенос отделов и миграция старого кэша без участников адаптации');

// Клиент уникален в категории за весь конкурс, включая другого сотрудника и день.
const live=C.validateForPublish(JSON.parse(fs.readFileSync(__dirname+'/state.json','utf8')));
const clone=()=>JSON.parse(JSON.stringify(live));
for(const kind of ['assigned','held']){
 const candidate=clone(),field=kind+'Events',original=candidate[field][0];
 candidate[field].push({...original,id:'f'.repeat(64),personId:C.people.find(p=>p.id!==original.personId).id,date:'2026-09-30',occurredAt:undefined});
 if(kind==='assigned')candidate.assigned=C.assignedCounts(candidate.assignedEvents);
 assert.throws(()=>C.validateForPublish(candidate),/клиент уже зачтён/);
}
const manual=clone();manual.assigned[id][8]++;assert.throws(()=>C.validateForPublish(manual),/совпадать с журналом/);
const noJournal=clone();delete noJournal.assignedEvents;assert.throws(()=>C.validateForPublish(noJournal),/журналы с ID клиента/);
const noClient=clone();delete noClient.heldEvents[0].clientKey;assert.throws(()=>C.validateForPublish(noClient),/журналы с ID клиента/);
const both=C.empty();both.assignedEvents=[{id:'a'.repeat(64),clientKey:'b'.repeat(64),personId:id,date:'2026-09-07'}];both.assigned=C.assignedCounts(both.assignedEvents);both.heldEvents=[{id:'c'.repeat(64),clientKey:'b'.repeat(64),personId:id,date:'2026-09-08'}];assert.equal(C.summary(C.validateForPublish(both)).held,1);
assert.equal(new Set(live.assignedEvents.map(e=>e.clientKey)).size,live.assignedEvents.length);
assert.equal(new Set(live.heldEvents.map(e=>e.clientKey)).size,live.heldEvents.length);
new vm.Script(fs.readFileSync(__dirname+'/admin.js','utf8'));
console.log('PASS: повторы клиентов между сотрудниками и датами, запрет чисел без журнала, отдельный зачёт назначения и проведения');
