// HabitForge — app.js (PWA Preview)
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const store = {
  load(key, fallback){ try{ return JSON.parse(localStorage.getItem(key)) ?? fallback }catch{return fallback} },
  save(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
};

const state = {
  user: store.load('hf_user', { name: 'Você', xp: 0, level: 1 }),
  habits: store.load('hf_habits', []),
  entries: store.load('hf_entries', {}), // key: YYYY-MM-DD -> { habitId: 'done'|'miss' }
  achievements: store.load('hf_achs', []), // codes unlocked
};

const todayStr = () => new Date().toISOString().slice(0,10);

function render(){
  renderProgress();
  renderHabits();
  renderProfile();
  renderAchievements();
  renderStats();
  computeNextGoal();
}

function dayCompletionPercent(dateStr=todayStr()){
  const todays = state.habits.filter(h => isHabitScheduledToday(h));
  if(todays.length === 0) return 0;
  const m = state.entries[dateStr] || {};
  const done = todays.filter(h => m[h.id] === 'done').length;
  return Math.round((done / todays.length) * 100);
}

function renderProgress(){
  const pct = dayCompletionPercent();
  const offset = 326 - (326 * pct / 100);
  $('.progress-ring .fg').style.strokeDashoffset = `${offset}`;
  $('#progressPercent').textContent = `${pct}%`;
  $('#streakSummary').textContent = streakSummaryText();
}

function renderHabits(){
  const wrap = $('#habitList'); wrap.innerHTML='';
  if(state.habits.length === 0){
    wrap.innerHTML = `<div class="habit-card"><header><div class="habit-chip"><div class="icon">✨</div><div><div class="habit-name">Sem hábitos ainda</div><div class="habit-desc">Crie seu primeiro hábito para começar a forjar sua rotina.</div></div></div></header></div>`;
    return;
  }
  const map = state.entries[todayStr()] || {};
  state.habits.forEach(h => {
    const color = h.color || '#7BE0B8';
    const icon = h.icon || '⭐';
    const status = map[h.id] === 'done';
    const streak = computeStreak(h);
    const card = document.createElement('div');
    card.className = 'habit-card';
    card.innerHTML = `
      <header>
        <div class="habit-chip">
          <div class="icon" style="background:${hexToGlass(color)}">${icon}</div>
          <div>
            <div class="habit-name">${h.name}</div>
            <div class="habit-desc">${h.description||''}</div>
          </div>
        </div>
        <span class="badge">Streak: ${streak}d</span>
      </header>
      <div class="habit-actions">
        <button class="btn ${status?'primary':''}" data-action="toggle" data-id="${h.id}">${status?'Feito':'Marcar'}</button>
        <button class="btn" data-action="edit" data-id="${h.id}">Editar</button>
        <button class="btn danger" data-action="delete" data-id="${h.id}">Excluir</button>
      </div>
    `;
    wrap.appendChild(card);
  });

  wrap.addEventListener('click', onHabitListClick, { once: true });
}

function onHabitListClick(e){
  const btn = e.target.closest('button'); if(!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if(action === 'toggle'){
    const date = todayStr();
    const map = state.entries[date] || {};
    map[id] = map[id] === 'done' ? 'miss' : 'done';
    state.entries[date] = map;
    store.save('hf_entries', state.entries);
    if(map[id] === 'done'){
      addXP(10);
      checkAchievements();
    }
    render();
  } else if(action === 'edit'){
    openHabitModal(state.habits.find(h => h.id === id));
  } else if(action === 'delete'){
    if(confirm('Excluir este hábito?')){
      state.habits = state.habits.filter(h => h.id !== id);
      Object.keys(state.entries).forEach(d=>{ delete state.entries[d]?.[id]; });
      store.save('hf_habits', state.habits);
      store.save('hf_entries', state.entries);
      render();
    }
  }
}

function addXP(amount){
  state.user.xp += amount;
  state.user.level = Math.max(1, Math.floor(state.user.xp / 200));
  store.save('hf_user', state.user);
}

function streakSummaryText(){
  const totals = state.habits.map(h => computeStreak(h));
  const top = Math.max(0, ...totals);
  return top>0 ? `Maior sequência ativa: ${top} dias` : 'Mantenha sua sequência.';
}

function computeStreak(habit){
  let streak = 0;
  for(let i=0;i<400;i++){
    const d = new Date(); d.setDate(d.getDate()-i);
    const ds = d.toISOString().slice(0,10);
    const map = state.entries[ds] || {};
    const status = map[habit.id];
    if(habit.type === 'no_do'){
      if(status === 'miss') break;
      if(status === 'done' || status===undefined) streak++; else break;
    } else {
      if(status === 'done') streak++; else break;
    }
  }
  return streak;
}

function isHabitScheduledToday(h){
  if(h.frequency==='daily') return true;
  const day = new Date().getDay(); // 0 Dom .. 6 Sáb
  if(h.frequency==='weekly') return [1,2,3,4,5].includes(day); // seg-sex
  if(h.frequency==='custom') return (h.days||[]).includes(day);
  return true;
}

function openHabitModal(habit){
  const dlg = $('#habitModal');
  $('#habitModalTitle').textContent = habit ? 'Editar hábito' : 'Novo hábito';
  const form = $('#habitForm');
  form.reset();
  form.dataset.editing = habit ? habit.id : '';
  if(habit){
    form.name.value = habit.name;
    form.description.value = habit.description||'';
    form.type.value = habit.type || 'do';
    form.frequency.value = habit.frequency || 'daily';
    form.icon.value = habit.icon || '';
    form.color.value = habit.color || '#7BE0B8';
    if(habit.frequency==='custom'){
      const ds = new Set(habit.days||[]);
      $$('input[name="days"]').forEach(cb => cb.checked = ds.has(+cb.value));
    }
  }
  dlg.showModal();
}

function saveHabitFromForm(){
  const form = $('#habitForm');
  const days = $$('input[name="days"]:checked').map(cb=>+cb.value);
  const data = {
    id: form.dataset.editing || cryptoRandomId(),
    name: form.name.value.trim(),
    description: form.description.value.trim(),
    type: form.type.value,
    frequency: form.frequency.value,
    icon: form.icon.value.trim() || '✅',
    color: form.color.value,
    days
  };
  if(form.dataset.editing){
    state.habits = state.habits.map(h => h.id===data.id? data : h);
  } else {
    state.habits.push(data);
  }
  store.save('hf_habits', state.habits);
  $('#habitModal').close();
  render();
}

function computeNextGoal(){
  const streaks = state.habits.map(h=>computeStreak(h));
  const top = Math.max(0, ...streaks);
  const milestones = [1,7,30,90,180,365];
  const next = milestones.find(m=>m>top);
  const card = $('#nextGoalCard');
  if(next){
    card.hidden = false;
    $('#nextGoalText').textContent = `Faltam ${next-top} dia(s) para ${next} dias de sequência.`;
  } else {
    card.hidden = true;
  }
}

function checkAchievements(){
  const codes = new Set(state.achievements);
  const milestones = [
    {code:'FIRST_CHECK', title:'Primeiro Passo', m:1},
    {code:'WEEK_STREAK', title:'Semanal', m:7},
    {code:'MONTH_STREAK', title:'Mensal', m:30},
  ];
  state.habits.forEach(h=>{
    const s = computeStreak(h);
    milestones.forEach(ms=>{
      if(s>=ms.m) codes.add(ms.code);
    });
  });
  state.achievements = Array.from(codes);
  store.save('hf_achs', state.achievements);
  renderAchievements();
}

function renderAchievements(){
  const grid = $('#achievementGrid'); if(!grid) return;
  grid.innerHTML='';
  const all = [
    {code:'FIRST_CHECK', title:'Primeiro Passo', desc:'Seu primeiro check-in.', icon:'🥉'},
    {code:'WEEK_STREAK', title:'Semanal', desc:'7 dias seguidos.', icon:'🥈'},
    {code:'MONTH_STREAK', title:'Mensal', desc:'30 dias seguidos.', icon:'🥇'},
    {code:'NINJA_90', title:'Trimestre Ninja', desc:'90 dias seguidos.', icon:'🏆'},
    {code:'HALF_YEAR', title:'Seis Meses', desc:'180 dias seguidos.', icon:'💎'},
    {code:'YEAR_LEGEND', title:'Ano Lendário', desc:'365 dias seguidos.', icon:'👑'},
  ];
  const unlocked = new Set(state.achievements);
  all.forEach(a=>{
    const el = document.createElement('div');
    el.className = 'achievement'+(unlocked.has(a.code)?'':' locked');
    el.innerHTML = `
      <div style="font-size:40px">${a.icon}</div>
      <h4>${a.title}</h4>
      <p>${a.desc}</p>
    `;
    grid.appendChild(el);
  });
}

function renderStats(){
  const area = $('#statsArea'); if(!area) return;
  area.innerHTML='';
  state.habits.forEach(h=>{
    const streak = computeStreak(h);
    const card = document.createElement('div');
    card.className='stat-card';
    card.innerHTML = `<strong>${h.icon} ${h.name}</strong><br><small>${h.description||''}</small><p>Streak atual: <b>${streak} dia(s)</b></p>`;
    area.appendChild(card);
  });
}

function renderProfile(){
  $('#profileName').textContent = state.user.name || 'Você';
  $('#profileLevel').textContent = `Nível ${state.user.level}`;
}

function cryptoRandomId(){
  return (crypto.getRandomValues(new Uint32Array(2)).join('-'));
}

function hexToGlass(hex){
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if(!m) return 'rgba(255,255,255,.06)';
  const r = parseInt(m[1],16), g = parseInt(m[2],16), b = parseInt(m[3],16);
  return `rgba(${r},${g},${b},0.18)`;
}

// SPA Views
function setTab(tab){
  $$('.tab').forEach(b=>{ b.classList.toggle('active', b.dataset.tab===tab); b.setAttribute('aria-selected', b.dataset.tab===tab)});
  $('#view-achievements').hidden = tab!=='achievements';
  $('#view-stats').hidden = tab!=='stats';
  $('#view-profile').hidden = tab!=='profile';
}

function shareDay(){
  const canvas = $('#storyCanvas');
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0,0,0,1920);
  grad.addColorStop(0,'#0E0F13'); grad.addColorStop(1,'#151922');
  ctx.fillStyle = grad; ctx.fillRect(0,0,1080,1920);
  ctx.fillStyle = '#7BE0B8'; ctx.font = 'bold 80px Inter, sans-serif';
  ctx.fillText('HabitForge', 60, 140);
  const pct = dayCompletionPercent();
  ctx.fillStyle = '#E6EAF2'; ctx.font = 'bold 120px Inter, sans-serif';
  ctx.fillText(`${pct}% concluído`, 60, 320);
  ctx.fillStyle = '#9AA3B2'; ctx.font = '600 42px Inter, sans-serif';
  ctx.fillText(new Date().toLocaleDateString('pt-BR'), 60, 380);
  ctx.fillStyle = '#9AA3B2'; ctx.font = '500 36px Inter, sans-serif';
  ctx.fillText('@seu_usuario', 60, 1820);
  const cx=900, cy=360, r=160, full=2*Math.PI*0.75;
  ctx.strokeStyle='rgba(255,255,255,.08)'; ctx.lineWidth=26; ctx.beginPath(); ctx.arc(cx,cy,r, -Math.PI/2, -Math.PI/2 + full); ctx.stroke();
  ctx.strokeStyle='#7BE0B8'; ctx.lineWidth=26; ctx.beginPath(); ctx.arc(cx,cy,r, -Math.PI/2, -Math.PI/2 + full*(pct/100)); ctx.stroke();
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url; a.download = `habitforge-story-${todayStr()}.png`;
  a.click();
}

function bootstrap(){
  if(state.habits.length===0){
    state.habits = [
      {id: cryptoRandomId(), name:'Meditar', description:'5-10 minutos', type:'do', frequency:'daily', icon:'🧘', color:'#7BE0B8', days:[]},
      {id: cryptoRandomId(), name:'Ler', description:'10 páginas', type:'do', frequency:'custom', icon:'📚', color:'#FFD166', days:[1,3,5]},
      {id: cryptoRandomId(), name:'Sem açúcar', description:'Dias sem', type:'no_do', frequency:'daily', icon:'🚫', color:'#88B1FF', days:[]},
    ];
    store.save('hf_habits', state.habits);
  }
  render();
}

document.addEventListener('click', (e)=>{
  if(e.target.matches('#addHabitBtn')) openHabitModal();
  if(e.target.matches('#saveHabitBtn')) saveHabitFromForm();
  if(e.target.matches('#viewAchievements')){ setTab('achievements'); $('#view-achievements').scrollTop = 0; }
  if(e.target.matches('#resetData')){ if(confirm('Resetar todos os dados?')){ localStorage.clear(); location.reload(); } }
  if(e.target.matches('#shareDay')) shareDay();
});

$$('.tab').forEach(b=> b.addEventListener('click', ()=> setTab(b.dataset.tab)));

bootstrap();
