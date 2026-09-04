/* Общие правила, проверка данных и чтение опубликованного состояния. */
(function (root) {
  'use strict';
  const contestId = 'september-2026-07-30';
  const period = {start:'2026-09-07',end:'2026-09-30'};
  const people = root.ContestPeople;
  const ids = new Set(people.map(p=>p.id));
  const milestones = root.ContestMilestones;
  const cacheKey = contestId+'-published-v2';
  const draftKey = contestId+'-draft-v2';
  function empty() {
    return {schemaVersion:2,contestId,period:{...period},assigned:Object.fromEntries(people.map(p=>[p.id,Array(30).fill(0)])),heldEvents:[],unverifiedHeld:{},held:Object.fromEntries(people.map(p=>[p.id,0])),updatedAt:null};
  }
  function count(n) {if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>100000)throw Error('Количество встреч должно быть целым неотрицательным числом');return n;}
  function normalize(raw,{legacy=false}={}) {
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Неверный формат файла');
    if(!legacy&&(raw.schemaVersion!==2||raw.contestId!==contestId||raw.period?.start!==period.start||raw.period?.end!==period.end))throw Error('Файл должен относиться к конкурсу 7–30 сентября 2026');
    if(!raw.assigned||typeof raw.assigned!=='object'||Array.isArray(raw.assigned))throw Error('В файле нет назначенных встреч');
    const s=empty();
    for(const [id,values] of Object.entries(raw.assigned)) {
      if(!ids.has(id))throw Error('Неизвестный сотрудник: '+id);
      if(!Array.isArray(values)||values.length!==30)throw Error('Ожидается календарь из 30 дат');
      s.assigned[id]=values.map((n,i)=>{count(n);if(i<6&&n!==0)throw Error('Назначения до 7 сентября не входят в конкурс');return n;});
    }
    if(!legacy&&!Array.isArray(raw.heldEvents))throw Error('В файле нет журнала проведённых встреч');
    const seen=new Set();
    for(const e of raw.heldEvents||[]) {
      if(!e||!ids.has(e.personId)||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||e.date<period.start||e.date>period.end||!/^[a-f0-9]{64}$/.test(e.id))throw Error('Проверьте сотрудника, дату и идентификатор проведённой встречи');
      if(seen.has(e.id))throw Error('Одна и та же встреча внесена дважды');
      seen.add(e.id);s.heldEvents.push({id:e.id,personId:e.personId,date:e.date});s.held[e.personId]++;
    }
    const unverified=legacy?raw.held:raw.unverifiedHeld;
    for(const [id,n] of Object.entries(unverified||{})) {
      if(!ids.has(id))throw Error('Неизвестный сотрудник: '+id);
      count(n);if(n){s.unverifiedHeld[id]=n;s.held[id]+=n;}
    }
    if(raw.updatedAt!==null&&raw.updatedAt!==undefined) {
      if(typeof raw.updatedAt!=='string'||!Number.isFinite(Date.parse(raw.updatedAt)))throw Error('Некорректное время обновления');
      s.updatedAt=raw.updatedAt;
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
  const signature=s=>JSON.stringify([s.assigned,s.heldEvents,s.unverifiedHeld]);
  function cached(){try{return normalize(JSON.parse(localStorage.getItem(cacheKey)))}catch{return empty();}}
  let published=cached(),listeners=[],busy=false,lastSuccess=null,lastError=null,started=false;
  function message(){if(lastError)return 'Нет связи · показана последняя загруженная версия';if(!lastSuccess)return 'Подключение к опубликованным данным';if(!published.updatedAt)return 'Данные ещё не опубликованы';const stale=Date.now()-Date.parse(published.updatedAt)>86400000;return (stale?'Данные старше суток · ':'Обновлено ')+new Date(published.updatedAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})+' МСК';}
  function notify(changed){listeners.forEach(fn=>fn(published,{changed,message:message(),error:lastError,lastSuccess}));}
  async function refresh(){
    if(busy)return;busy=true;
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try {
      const response=await fetch('./state.json?t='+Date.now(),{cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('HTTP '+response.status);
      const s=normalize(await response.json());
      if(Object.values(s.unverifiedHeld).some(n=>n>0))throw Error('Опубликованы встречи без дат');
      const changed=signature(s)!==signature(published)||s.updatedAt!==published.updatedAt;
      published=s;lastSuccess=Date.now();lastError=null;
      try{localStorage.setItem(cacheKey,JSON.stringify(s));}catch{}
      notify(changed);
    }catch(e){lastError=e.message;notify(false);}finally{clearTimeout(timer);busy=false;}
  }
  function watch(fn){listeners.push(fn);fn(published,{changed:true,message:message(),error:lastError,lastSuccess});if(!started){started=true;refresh();setInterval(()=>{if(!document.hidden)refresh();},30000);addEventListener('focus',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});}}
  root.Contest={contestId,period,people,milestones,cacheKey,draftKey,empty,count,normalize,reward,next,bonus,total,rank,progress,summary,signature,cached,refresh,watch};
})(typeof window==='undefined'?globalThis:window);
