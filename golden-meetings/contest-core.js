/* Общие правила, проверка данных и чтение опубликованного состояния. */
(function (root) {
  'use strict';
  const contestId = 'september-2026-07-30';
  const period = {start:'2026-09-07',end:'2026-09-30'};
  const people = root.ContestPeople;
  const ids = new Set(people.map(p=>p.id));
  const excludedIds = new Set(root.ContestExcludedIds||[]);
  const departments = root.ContestDepartments||[...new Set(people.map(p=>p.dept))];
  function scope(value){if(!value||value==='all'||value==='top10'||value==='departments')return value||'all';if(value.startsWith('dept:')&&departments.includes(value.slice(5)))return value;return 'all';}
  const milestones = root.ContestMilestones;
  const cacheKey = contestId+'-published-v2';
  const draftKey = contestId+'-draft-v2';
  function empty() {
    return {schemaVersion:2,contestId,period:{...period},assigned:Object.fromEntries(people.map(p=>[p.id,Array(30).fill(0)])),heldEvents:[],unverifiedHeld:{},payments:[],held:Object.fromEntries(people.map(p=>[p.id,0])),updatedAt:null};
  }
  function count(n) {if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>100000)throw Error('Количество встреч должно быть целым неотрицательным числом');return n;}
  function journal(events,kind){
    if(!Array.isArray(events))throw Error('Ожидается журнал встреч');
    const result=[],seen=new Set(),clients=new Map();
    for(const e of events){
      if(!e||(!ids.has(e.personId)&&!excludedIds.has(e.personId))||!/^2026-09-\d{2}$/.test(e.date)||e.date<period.start||e.date>period.end||!/^[a-f0-9]{64}$/.test(e.id))throw Error('Проверьте сотрудника, дату и идентификатор встречи');
      if(e.clientKey!==undefined&&!/^[a-f0-9]{64}$/.test(e.clientKey))throw Error('Некорректный идентификатор клиента');
      if(excludedIds.has(e.personId))continue;
      if(seen.has(e.id))throw Error('Одна и та же встреча внесена дважды');seen.add(e.id);
      if(e.clientKey){if(clients.has(e.clientKey)){const first=clients.get(e.clientKey),p=people.find(p=>p.id===first.personId);throw Error('Этот клиент уже зачтён: '+p.name+', '+first.date+'. Повтор в '+(kind==='assigned'?'назначениях':'проведениях')+' не засчитывается');}clients.set(e.clientKey,e);}
      const item={id:e.id,personId:e.personId,date:e.date};if(e.clientKey)item.clientKey=e.clientKey;if(e.occurredAt){if(!/^2026-09-\d{2}T\d{2}:\d{2}:\d{2}\+03:00$/.test(e.occurredAt)||e.occurredAt.slice(0,10)!==e.date||!Number.isFinite(Date.parse(e.occurredAt)))throw Error('Некорректное время встречи');item.occurredAt=e.occurredAt;}result.push(item);
    }return result;
  }
  function assignedCounts(events){const a=Object.fromEntries(people.map(p=>[p.id,Array(30).fill(0)]));for(const e of events)a[e.personId][Number(e.date.slice(-2))-1]++;return a;}
  function validateForPublish(raw){const s=normalize(raw);if(!Array.isArray(s.assignedEvents)||[...s.assignedEvents,...s.heldEvents].some(e=>!e.clientKey)||Object.values(s.unverifiedHeld).some(n=>n>0))throw Error('Для защиты от повторов нужны журналы с ID клиента. Возьмите свежие данные с сайта или загрузите полную выгрузку встреч.');return s;}
  function normalize(raw,{legacy=false}={}) {
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Неверный формат файла');
    if(!legacy&&(raw.schemaVersion!==2||raw.contestId!==contestId||raw.period?.start!==period.start||raw.period?.end!==period.end))throw Error('Файл должен относиться к конкурсу 7–30 сентября 2026');
    if(!raw.assigned||typeof raw.assigned!=='object'||Array.isArray(raw.assigned))throw Error('В файле нет назначенных встреч');
    const s=empty();
    for(const [id,values] of Object.entries(raw.assigned)) {
      if(!ids.has(id)&&!excludedIds.has(id))throw Error('Неизвестный сотрудник: '+id);
      if(!Array.isArray(values)||values.length!==30)throw Error('Ожидается календарь из 30 дат');
      const checked=values.map((n,i)=>{count(n);if(i<6&&n!==0)throw Error('Назначения до 7 сентября не входят в конкурс');return n;});if(ids.has(id))s.assigned[id]=checked;
    }
    if(!legacy&&!Array.isArray(raw.heldEvents))throw Error('В файле нет журнала проведённых встреч');
    if(raw.assignedEvents!==undefined){s.assignedEvents=journal(raw.assignedEvents,'assigned');const expected=assignedCounts(s.assignedEvents);for(const p of people)if(expected[p.id].some((n,i)=>n!==s.assigned[p.id][i]))throw Error('Назначения должны совпадать с журналом клиентов: '+p.name);s.assigned=expected;}
    s.heldEvents=journal(raw.heldEvents||[],'held');for(const e of s.heldEvents)s.held[e.personId]++;
    const unverified=legacy?raw.held:raw.unverifiedHeld;
    for(const [id,n] of Object.entries(unverified||{})) {
      if(!ids.has(id)&&!excludedIds.has(id))throw Error('Неизвестный сотрудник: '+id);
      count(n);if(n&&ids.has(id)){s.unverifiedHeld[id]=n;s.held[id]+=n;}
    }
    if(raw.updatedAt!==null&&raw.updatedAt!==undefined) {
      if(typeof raw.updatedAt!=='string'||!Number.isFinite(Date.parse(raw.updatedAt)))throw Error('Некорректное время обновления');
      s.updatedAt=raw.updatedAt;
    }
    if(raw.payments!==undefined){
      if(!Array.isArray(raw.payments))throw Error('Неверный журнал выплат');
      const seen=new Set();
      s.payments=raw.payments.map(p=>{
        if(!p||!ids.has(p.personId)||!['assigned','held'].includes(p.kind)||!['paid','queued'].includes(p.status)||!Number.isSafeInteger(p.amount)||p.amount<=0||p.amount>1000000||!Number.isFinite(Date.parse(p.markedAt)))throw Error('Проверьте запись выплаты');
        if(p.kind==='assigned'?(!/^2026-09-\d{2}$/.test(p.target)||p.target<period.start||p.target>period.end):!milestones.some(m=>String(m.n)===p.target))throw Error('Неверная цель выплаты');
        const key=p.personId+':'+p.kind+':'+p.target;if(seen.has(key))throw Error('Повтор выплаты');seen.add(key);
        return {personId:p.personId,kind:p.kind,target:p.target,amount:p.amount,status:p.status,markedAt:p.markedAt};
      });
    }
    return s;
  }
  const reward=n=>milestones.reduce((p,m)=>n>=m.n?m.p:p,0);
  const next=n=>milestones.find(m=>n<m.n)||null;
  const bonus=a=>a.slice(6,30).reduce((s,n)=>s+Math.max(0,n-3)*1000,0);
  const total=a=>a.slice(6,30).reduce((s,n)=>s+n,0);
  const rank=(values,value)=>value>0?1+values.filter(v=>v>value).length:null;
  function progress(n) {const index=milestones.findIndex(m=>n<m.n);if(index<0)return 100;const previous=index?milestones[index-1].n:0;return (index+(n-previous)/(milestones[index].n-previous))/milestones.length*100;}
  const summary=s=>({assigned:people.reduce((n,p)=>n+total(s.assigned[p.id]),0),held:people.reduce((n,p)=>n+s.held[p.id],0),money:people.reduce((n,p)=>n+bonus(s.assigned[p.id])+reward(s.held[p.id]),0)});
  function paymentRows(s){
    const rows=[];
    for(const p of people){
      for(let d=7;d<=30;d++){const amount=Math.max(0,s.assigned[p.id][d-1]-3)*1000;if(amount)rows.push({personId:p.id,kind:'assigned',target:'2026-09-'+String(d).padStart(2,'0'),date:'2026-09-'+String(d).padStart(2,'0'),amount,label:s.assigned[p.id][d-1]+' назначенных за день'});}
      const events=s.heldEvents.filter(e=>e.personId===p.id).sort((a,b)=>a.date.localeCompare(b.date));
      milestones.forEach((m,i)=>{if(events.length>=m.n)rows.push({personId:p.id,kind:'held',target:String(m.n),date:events[m.n-1].date,amount:m.p-(i?milestones[i-1].p:0),label:m.n+' проведённых'+(i?' · доплата до '+m.p.toLocaleString('ru-RU')+' ₽':'')});});
    }
    const key=r=>r.personId+':'+r.kind+':'+r.target;
    for(const p of s.payments||[])if(!rows.some(r=>key(r)===key(p)))rows.push({personId:p.personId,kind:p.kind,target:p.target,date:p.kind==='assigned'?p.target:null,amount:0,label:'Цель больше не подтверждена'});
    return rows.map(r=>{const payment=(s.payments||[]).find(p=>key(p)===key(r)),paid=payment?.status==='paid'?payment.amount:0,queued=payment?.status==='queued'?Math.min(payment.amount,r.amount):0;return {...r,key:key(r),payment,paid,queued,due:Math.max(0,r.amount-paid),overpaid:Math.max(0,paid-r.amount)};});
  }
  const paymentSummary=s=>paymentRows(s).reduce((t,r)=>({earned:t.earned+r.amount,paid:t.paid+r.paid,queued:t.queued+r.queued,due:t.due+r.due,overpaid:t.overpaid+r.overpaid}),{earned:0,paid:0,queued:0,due:0,overpaid:0});
  const signature=s=>JSON.stringify([s.assigned,s.assignedEvents,s.heldEvents,s.unverifiedHeld,s.payments||[]]);
  function cached(){try{return normalize(JSON.parse(localStorage.getItem(cacheKey)))}catch{return empty();}}
  let localStorageHasCache=false;
  let published=cached(),listeners=[],busy=false,lastSuccess=null,lastError=null,started=false;
  function message(){if(lastError)return 'Нет связи · показана последняя загруженная версия';if(!lastSuccess)return 'Подключение к опубликованным данным';if(!published.updatedAt)return 'Данные ещё не опубликованы';const stale=Date.now()-Date.parse(published.updatedAt)>86400000;return (stale?'Данные старше суток · ':'Обновлено ')+new Date(published.updatedAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' МСК';}
  function notify(changed){listeners.forEach(fn=>fn(published,{changed,message:message(),error:lastError,lastSuccess}));}
  async function refresh(){
    if(busy)return;busy=true;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await fetch('./state.json?t='+Date.now(),{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('HTTP '+response.status);
      const s=validateForPublish(await response.json());
      if(Object.values(s.unverifiedHeld).some(n=>n>0))throw Error('Опубликованы встречи без дат');
      const changed=signature(s)!==signature(published)||s.updatedAt!==published.updatedAt;
      published=s;lastSuccess=Date.now();lastError=null;
      if(changed||!localStorageHasCache){try{localStorage.setItem(cacheKey,JSON.stringify(s));localStorageHasCache=true;}catch{}}
      notify(changed);return true;
    }catch(e){lastError=e.message;notify(false);return false;}finally{clearTimeout(timer);busy=false;}
  }
  function watch(fn){listeners.push(fn);fn(published,{changed:true,message:message(),error:lastError,lastSuccess});if(!started){started=true;refresh();setInterval(()=>{if(!document.hidden)refresh();},30000);addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});}}
  root.Contest={contestId,period,people,departments,scope,milestones,cacheKey,draftKey,empty,count,normalize,validateForPublish,assignedCounts,reward,next,bonus,total,rank,progress,summary,paymentRows,paymentSummary,signature,cached,refresh,watch};
})(typeof window==='undefined'?globalThis:window);
