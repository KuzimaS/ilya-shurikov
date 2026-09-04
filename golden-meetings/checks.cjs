/* Запуск: node golden-meetings/checks.cjs */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const context={window:{},Set,Date,console};vm.createContext(context);
for(const file of ['contest-data.js','contest-core.js'])vm.runInContext(fs.readFileSync(__dirname+'/'+file,'utf8'),context);
const C=context.window.Contest,id=C.people[0].id;
for(const [n,p] of [[0,0],[2,0],[3,10000],[4,15000],[5,25000],[6,30000],[7,40000],[8,40000],[9,50000],[11,50000],[12,60000],[14,60000],[15,70000],[30,70000]])assert.equal(C.reward(n),p);
const s=C.empty();s.assigned[id][6]=4;s.assigned[id][29]=6;assert.equal(C.bonus(s.assigned[id]),4000);
assert.equal(C.rank([5,5,3,0],5),1);assert.equal(C.rank([5,5,3,0],3),3);assert.equal(C.rank([0,0],0),null);
assert.equal(C.progress(3),12.5);assert.equal(C.progress(7),62.5);assert.equal(C.progress(15),100);
for(let i=0;i<6;i++)s.heldEvents.push({personId:id,date:'2026-09-07',id:String(i).padStart(64,'0')});
const valid=C.normalize(s);assert.equal(valid.held[id],6);assert.equal(C.summary(valid).money,34000);
assert.equal(C.reward(0)+C.reward(6),30000);assert.equal(C.reward((0+6)/2)*2,20000);
assert.throws(()=>C.normalize({...s,contestId:'other'}));assert.throws(()=>C.normalize({}));assert.throws(()=>C.count(3.5));assert.throws(()=>C.count(-1));
assert.throws(()=>C.normalize({...s,heldEvents:[s.heldEvents[0],s.heldEvents[0]]}));
assert.throws(()=>C.normalize({...s,heldEvents:[{...s.heldEvents[0],date:'2026-09-06'}]}));
assert.throws(()=>C.normalize({...s,heldEvents:[{...s.heldEvents[0],personId:'missing'}]}));
const legacy=C.normalize({assigned:{},held:{[id]:7}},{legacy:true});assert.equal(legacy.unverifiedHeld[id],7);assert.equal(legacy.held[id],7);
for(const name of ['index.html','tv-assigned.html','tv-held.html','tv-top10.html']){const html=fs.readFileSync(__dirname+'/'+name,'utf8');for(const [,script] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(script);for(const [,path] of html.matchAll(/<script src="\.\/([^"?]+)/g))assert.ok(fs.existsSync(__dirname+'/'+path));}
assert.equal(C.people.length,65);assert.equal(new Set(C.people.map(p=>p.id)).size,65);
C.normalize(JSON.parse(fs.readFileSync(__dirname+'/state.json','utf8')));
console.log('PASS: выплаты, даты, дубли, импорт, миграция, места, прогресс, 65 участников и синтаксис страниц');
