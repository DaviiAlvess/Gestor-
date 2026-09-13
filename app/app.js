'use strict';
const $ = selector => document.querySelector(selector);
const F = Finance;
const D = FinanceData;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const dateLabel = value => F.validDate(value) ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : 'Data inválida';
let SQL, db, store, user, demo = false, period = F.iso(new Date()).slice(0,7), activeView = 'overview';
let allTransactions = [], pending = [], settings, categories = [], editorAction, debtResult, toastTimer, editorDirty = false;
const memoryStorage = () => { const values = new Map(); return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}; };
const query = (sql, params = []) => store.query(sql, params);
async function change(action) {
  try { return await store.change(database => {db = database;return action(database);}); }
  finally { db = store.db; }
}
function notify(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').hidden = true, 6000);
}
function download(content, filename, type) {
  if (window.GestorAndroid?.saveFile) {
    const reader = new FileReader();
    reader.onload = () => window.GestorAndroid.saveFile(filename, type || 'application/octet-stream', String(reader.result).split(',')[1] || '');
    reader.readAsDataURL(new Blob([content], { type: type || 'application/octet-stream' }));
    return;
  }
  const url = URL.createObjectURL(new Blob([content],{type}));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url),60000);
}
async function passwordHash(password, salt) {
  if (!crypto.subtle) throw new Error('Abra pelo endereço HTTPS do Gestor ou pelo aplicativo instalado para acessar seu perfil.');
  salt ||= Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,'0')).join('');
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt:new TextEncoder().encode(salt), iterations:210000, hash:'SHA-256' },key,256);
  return `pbkdf2$${salt}$${Array.from(new Uint8Array(bits),b => b.toString(16).padStart(2,'0')).join('')}`;
}
function defaults(id) {
  if(!query('SELECT id FROM categories WHERE user_id=?',[id]).length) {
    ['Alimentação','Transporte','Moradia','Saúde','Lazer','Salário','Dívidas','Outros'].forEach(name => db.run('INSERT INTO categories (user_id,name,isEssential) VALUES (?,?,?)',[id,name,['Alimentação','Moradia','Saúde','Transporte'].includes(name)?1:0]));
  }
  if(!query('SELECT id FROM settings WHERE user_id=?',[id]).length) db.run('INSERT INTO settings (user_id,spendingLimit,incomeGoal) VALUES (?,?,?)',[id,0,0]);
}
function setAuthScreen(screen) {
  const signup = screen === 'signup';
  $('#login-screen').hidden = signup;
  $('#signup-screen').hidden = !signup;
  $('#login-error').textContent = '';
  $('#signup-error').textContent = '';
  (signup ? $('#signup-username') : $('#login-identifier')).focus();
}
async function verifyPassword(match, password) {
  const valid = match.password.startsWith('pbkdf2$') ? await passwordHash(password,match.password.split('$')[1]) === match.password : match.password === password;
  if (!valid) return false;
  if (!match.password.startsWith('pbkdf2$')) {
    const hash = await passwordHash(password);
    await change(() => db.run('UPDATE users SET password=? WHERE id=?',[hash,match.id]));
  }
  return true;
}
async function loginAccount() {
  if (!$('#login-form').reportValidity()) return;
  $('#login-error').textContent = ''; $('#login').disabled = true;
  try {
    const identifier = $('#login-identifier').value.trim().toLowerCase(), password = $('#login-password').value;
    const match = query('SELECT * FROM users WHERE lower(username)=? OR lower(email)=?',[identifier,identifier])[0];
    if (!match || !await verifyPassword(match,password)) throw new Error('Usuário, email ou senha não conferem.');
    user = {id:match.id,username:match.username,email:match.email};
    localStorage.setItem('user',JSON.stringify(user));
    $('#login-password').value = '';
    await showApp();
  } catch(error) { $('#login-error').textContent = error.message; }
  finally { $('#login').disabled = false; }
}
async function signupAccount() {
  if (!$('#signup-form').reportValidity()) return;
  $('#signup-error').textContent = ''; $('#signup').disabled = true;
  try {
    const username = $('#signup-username').value.trim().toLowerCase(), email = $('#signup-email').value.trim().toLowerCase();
    const password = $('#signup-password').value, confirmation = $('#signup-confirm').value;
    if (!/^[a-z0-9._]{3,30}$/.test(username)) throw new Error('Use de 3 a 30 caracteres no usuário, apenas letras, números, ponto ou sublinhado.');
    if (password !== confirmation) throw new Error('As senhas digitadas não são iguais.');
    if (query('SELECT id FROM users WHERE lower(username)=?',[username]).length) throw new Error('Este nome de usuário já está em uso neste dispositivo.');
    if (query('SELECT id FROM users WHERE lower(email)=?',[email]).length) throw new Error('Já existe uma conta com este email neste dispositivo.');
    const hash = await passwordHash(password);
    await change(() => {
      db.run('INSERT INTO users (username,email,password) VALUES (?,?,?)',[username,email,hash]);
      defaults(query('SELECT last_insert_rowid() AS id')[0].id);
    });
    const match = query('SELECT * FROM users WHERE lower(username)=?',[username])[0];
    user = {id:match.id,username:match.username,email:match.email};
    localStorage.setItem('user',JSON.stringify(user));
    $('#signup-password').value = ''; $('#signup-confirm').value = '';
    await showApp();
    notify('Sua conta está pronta. Comece definindo o orçamento do mês em Planejamento.');
  } catch(error) { $('#signup-error').textContent = error.message; }
  finally { $('#signup').disabled = false; }
}
async function showApp() {
  await change(() => defaults(user.id));
  $('#auth').hidden = true; $('#app').hidden = false; $('#demo-banner').hidden = !demo;
  $('#save-label').textContent = demo ? 'Demonstração · não salva' : 'Salvo neste dispositivo';
  const profileLabel = user.username || user.email;
  $('#profile-name').textContent = demo ? 'Perfil de exemplo' : profileLabel;
  $('#avatar').textContent = profileLabel.slice(0,1).toUpperCase();
  refresh();setView('overview');
}
function monthRows() { return allTransactions.filter(t => t.date.startsWith(period)); }
function totals(rows) {
  return {income:rows.filter(t=>t.type==='income').reduce((sum,t)=>sum+Math.round(t.amount*100),0)/100,expense:rows.filter(t=>t.type==='expense').reduce((sum,t)=>sum+Math.round(t.amount*100),0)/100};
}
function refresh() {
  db=store.db;
  const rows=store.rows(user.id);
  allTransactions=rows.transactions;pending=rows.pending;categories=rows.categories;
  settings=store.budget(user.id,period);
  render();
}
const views = {
  overview:['Visão geral','Seu mês, em perspectiva.','Entradas e saídas confirmadas, com as próximas contas à vista.'],
  transactions:['Movimentações','Cada movimento, registrado.','Aqui entram apenas valores já pagos ou recebidos.'],
  goals:['Contas previstas','Um passo à frente.','Organize vencimentos, recorrências e parcelas que ainda serão pagas.'],
  planning:['Planejamento','Dê um destino ao seu dinheiro.','Defina seu orçamento mensal e acompanhe seus objetivos.'],
  reports:['Relatórios','Entenda seus números.','Compare meses e veja para onde seu dinheiro está indo.'],
  calculator:['Simulador','Faça as contas do futuro.','Explore prazos e possibilidades antes do próximo passo.'],
  data:['Dados e ajustes','Seus dados, sob seu controle.','Organize categorias, faça backups e recupere registros.'],
};
function setView(view) {
  if (!views[view]) return;activeView=view;
  document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==view);
  document.querySelectorAll('.nav-item').forEach(el=>{
    el.classList.toggle('active',el.dataset.view===view);
    if(el.dataset.view===view)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');
  });
  $('#breadcrumb').textContent=views[view][0];$('#page-title').textContent=views[view][1];$('#page-description').textContent=views[view][2];
  $('.period-toolbar').hidden=['goals','calculator','data'].includes(view);
}
function empty(title, detail, action = '') { return `<div class="empty-state"><strong>${title}</strong>${detail}${action}</div>`; }
function transactionRow(t, actions = false) {
  const incoming=t.type==='income';
  return `<div class="transaction-row"><span class="row-icon ${incoming?'income':'expense'}" aria-hidden="true">${incoming?'↙':'↗'}</span><div class="row-info"><p class="row-title">${esc(t.description)}</p><p class="row-meta">${esc(t.category||'Outros')} · ${dateLabel(t.date)}${t.sourceGoalId?' · Baixa de conta':''}</p></div><strong class="row-value ${incoming?'positive':'negative'}">${incoming?'+':'−'} ${F.money(t.amount)}</strong>${actions?`<div class="row-actions"><button class="icon-button" data-edit="${t.id}" aria-label="Editar ${esc(t.description)}">✎</button><button class="icon-button" data-delete="${t.id}" aria-label="Excluir ${esc(t.description)}">×</button></div>`:''}</div>`;
}
function filteredRows() {
  const search=$('#search').value.toLocaleLowerCase('pt-BR'),type=$('#type-filter').value,category=$('#category-filter').value;
  return ($('#all-history').checked?allTransactions:monthRows()).filter(t=>(type==='all'||t.type===type)&&(!category||t.category===category)&&`${t.description} ${t.category}`.toLocaleLowerCase('pt-BR').includes(search));
}
function renderTransactions() {
  const rows=filteredRows(),sum=totals(rows);
  $('#transactions-list').innerHTML=rows.map(t=>transactionRow(t,true)).join('')||empty('Nenhuma movimentação encontrada.','Tente outro filtro ou registre o primeiro pagamento ou recebimento.');
  $('#transaction-count').textContent=`${rows.length} registro(s) · Receitas: ${F.money(sum.income)} · Despesas: ${F.money(sum.expense)} · Resultado: ${F.money(sum.income-sum.expense)}`;
}
function renderGoals() {
  const filter=$('#goal-filter').value,search=$('#goal-search').value.toLowerCase(),today=F.iso(new Date());
  const endWeek=new Date(`${today}T12:00:00`);endWeek.setDate(endWeek.getDate()+7);
  const rows=pending.filter(g=>(!search||`${g.description} ${g.category}`.toLowerCase().includes(search))&&(filter==='all'||filter===g.type||(filter==='overdue'&&g.dueDate<today)||(filter==='week'&&g.dueDate>=today&&g.dueDate<=F.iso(endWeek))));
  $('#goals-list').innerHTML=rows.map(g=>`<div class="transaction-row"><span class="row-icon ${g.type==='income'?'income':'expense'}" aria-hidden="true">${g.type==='income'?'↙':'↗'}</span><div class="row-info"><p class="row-title">${esc(g.description)}</p><p class="row-meta ${g.dueDate<today?'overdue':''}">${g.type==='income'?'A receber':'A pagar'} · ${dateLabel(g.dueDate)}${g.dueDate<today?' · Em atraso':g.dueDate===today?' · Vence hoje':''}${g.seriesId?' · Série mensal':''}<br>${esc(g.category||'Contas')}</p></div><strong class="row-value">${F.money(g.amount)}</strong><div class="row-actions"><button class="icon-button" data-pay="${g.id}" aria-label="Dar baixa em ${esc(g.description)}">✓</button><button class="icon-button" data-edit-goal="${g.id}" aria-label="Editar conta ${esc(g.description)}">✎</button><button class="icon-button" data-delete-goal="${g.id}" aria-label="Excluir conta ${esc(g.description)}">×</button></div></div>`).join('')||empty('Nenhuma conta neste filtro.','Adicione uma conta ou ajuste a busca.');
  const sum=totals(rows);$('#goals-total').textContent=`${rows.length} conta(s) · A pagar: ${F.money(sum.expense)} · A receber: ${F.money(sum.income)}`;
}

function render() {
  settings = store.budget(user.id, period);
  const rows = monthRows(), {income,expense} = totals(rows), percent = settings.spendingLimit > 0 ? expense/settings.spendingLimit*100 : 0;
  $('#period-label').textContent = new Date(`${period}-01T12:00:00`).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  $('#balance-value').textContent = F.money(income-expense); $('#income-value').textContent = F.money(income); $('#expense-value').textContent = F.money(expense);
  const countIncome = rows.filter(t=>t.type==='income').length, countExpense = rows.length-countIncome;
  $('#income-detail').textContent = `${countIncome} entrada${countIncome===1?'':'s'} · meta de ${F.money(settings.incomeGoal)}`;
  $('#expense-detail').textContent = `${countExpense} saída${countExpense===1?'':'s'} no período`;
  $('#income-progress').style.width = `${Math.min(100,settings.incomeGoal>0?income/settings.incomeGoal*100:0)}%`; $('#expense-progress').style.width = `${Math.min(100,percent)}%`;
  $('#budget-amount').textContent = F.money(expense); $('#budget-limit').textContent = `de ${F.money(settings.spendingLimit)}`; $('#budget-percent').textContent = `${Math.round(percent)}% utilizado`; $('#budget-progress').style.width = `${Math.min(100,percent)}%`; $('#budget-progress').style.background = percent>100?'#b76b50':'#8ba46e';
  $('#budget-message').textContent = expense>settings.spendingLimit ? `${F.money(expense-settings.spendingLimit)} acima do limite planejado.` : `${F.money(settings.spendingLimit-expense)} disponíveis no seu planejamento.`;
  $('#budget-message').classList.toggle('over',expense>settings.spendingLimit); $('#goal-value').textContent = F.money(settings.incomeGoal);
  $('#recent-list').innerHTML = rows.slice(0,5).map(t=>transactionRow(t)).join('') || empty('Seu mês começa aqui.','Registre uma receita ou despesa para acompanhar seus números.','<br><button class="text-button" data-create>Adicionar primeira movimentação →</button>');
  $('#nav-count').textContent = $('#pending-count').textContent = pending.length;
  $('#upcoming-list').innerHTML = pending.slice(0,3).map(g => { const date = new Date(`${g.dueDate}T12:00:00`); return `<div class="upcoming-row"><span class="date-box"><strong>${date.getDate()}</strong><small>${date.toLocaleDateString('pt-BR',{month:'short'}).replace('.','')}</small></span><div class="row-info"><p class="row-title">${esc(g.description)}</p><p class="row-meta ${g.dueDate<F.iso(new Date())?'overdue':''}">${g.dueDate<F.iso(new Date())?'Em atraso':g.type==='income'?'A receber':'A pagar'}</p></div><strong class="row-value">${F.money(g.amount)}</strong></div>`; }).join('') || empty('Tudo em dia.','Nenhuma conta pendente por aqui.');
  renderGoals(); renderChart(rows); renderReports(rows,income,expense); renderExtras();
}
function renderChart(rows) {
  if (!rows.length) { $('#cash-chart').innerHTML = '<div class="chart-empty"><span>Um novo mês, uma página em branco.</span><small>Seu movimento aparece aqui a cada registro.</small></div>'; return; }
  const days = new Date(Number(period.slice(0,4)),Number(period.slice(5)),0).getDate();
  const buckets = Array.from({length:Math.ceil(days/7)},()=>({income:0,expense:0})); rows.forEach(t => buckets[Math.floor((Number(t.date.slice(-2))-1)/7)][t.type] += t.amount);
  const max = Math.max(1,...buckets.flatMap(b=>[b.income,b.expense]));
  let svg = '<svg viewBox="0 0 540 195" role="img" aria-label="Receitas e despesas por intervalo do mês">';
  [0,.5,1].forEach(r => { const y=155-r*130; svg+=`<line x1="55" y1="${y}" x2="535" y2="${y}" stroke="#edf0e8" stroke-dasharray="3 4"/><text x="0" y="${y+4}">${max*r>=1000?`${(max*r/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mil`:Math.round(max*r)}</text>`; });
  buckets.forEach((b,i) => { const x=80+i*(475/buckets.length), label=`${i*7+1} a ${Math.min(days,i*7+7)}`; ['income','expense'].forEach((type,j) => { const height=b[type]/max*130; svg+=`<rect x="${x+j*24}" y="${155-height}" width="17" height="${height}" rx="3" fill="${j?'#cfaa83':'#779362'}"><title>${label}: ${j?'Despesas':'Receitas'} ${F.money(b[type])}</title></rect>`; }); svg+=`<text x="${x+19}" y="183" text-anchor="middle">${label}</text>`; });
  $('#cash-chart').innerHTML = svg+'</svg>';
}
function renderReports(rows,income,expense) {
  $('#report-totals').innerHTML = [['Receitas',income],['Despesas',expense],['Saldo',income-expense]].map(([label,value])=>`<div class="report-total">${label}<strong>${F.money(value)}</strong></div>`).join('');
  const groups = {}; rows.filter(t=>t.type==='expense').forEach(t=>{ const key=t.category||'Outros'; Object.defineProperty(groups,key,{value:(Object.hasOwn(groups,key)?groups[key]:0)+t.amount,writable:true,configurable:true,enumerable:true}); });
  const sorted = Object.entries(groups).sort((a,b)=>b[1]-a[1]);
  $('#category-chart').innerHTML = sorted.map(([name,value])=>`<div class="category-row"><div><span>${esc(name)}</span><strong>${F.money(value)}<small>${Math.round(value/expense*100)}%</small></strong></div><div class="category-track"><span style="width:${value/expense*100}%"></span></div></div>`).join('') || empty('Sem despesas neste mês.','As categorias aparecem quando você registra uma saída.');
  $('#report-insight').innerHTML = `<p class="insight-number">${income?`${Math.round(expense/income*100)}%`:'Sem dados'}</p><p class="insight-copy">${income?'das suas receitas foram comprometidas com despesas neste período.':'Registre suas receitas para comparar entradas e saídas.'}</p><hr class="insight-divider"><p class="insight-copy">${sorted.length?`A maior categoria de despesas foi <strong>${esc(sorted[0][0])}</strong>, com ${F.money(sorted[0][1])}.`:'Você ainda não tem despesas para comparar neste período.'}</p><hr class="insight-divider"><p class="insight-copy">Os totais consideram as movimentações registradas. Contas pendentes entram no histórico somente após a baixa.</p>`;
}

function renderExtras() {
  $('#month-jump').value=period;
  const selected=$('#category-filter').value;
  $('#category-filter').innerHTML='<option value="">Todas as categorias</option>'+[...new Set(allTransactions.map(t=>t.category||'Outros'))].sort().map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if([...$('#category-filter').options].some(o=>o.value===selected))$('#category-filter').value=selected;
  const planned=totals(pending.filter(g=>g.dueDate<=`${period}-31`));
  const confirmed=totals(monthRows());
  const overdue=pending.filter(g=>g.dueDate<F.iso(new Date())&&g.type==='expense');
  $('#forecast').innerHTML=`<div><span>A pagar até o fim do mês</span><strong>${F.money(planned.expense)}</strong></div><div><span>A receber até o fim do mês</span><strong>${F.money(planned.income)}</strong></div><div><span>Resultado após pendências</span><strong>${F.money(confirmed.income-confirmed.expense+planned.income-planned.expense)}</strong></div><p>Projeção a partir do resultado do mês, incluindo contas atrasadas. Não representa saldo bancário.</p>`;
  $('#attention').hidden=!overdue.length;
  $('#attention').textContent=`${overdue.length} conta(s) em atraso, somando ${F.money(totals(overdue).expense)}. Veja em Contas previstas.`;
  if(!settings.spendingLimit) {
    $('#budget-percent').textContent='Limite não definido';$('#budget-limit').textContent='';
    $('#budget-message').textContent='Defina quanto pretende gastar neste mês em Planejamento.';$('#budget-message').classList.remove('over');
  }
  if(!settings.incomeGoal)$('#income-detail').textContent=`${monthRows().filter(t=>t.type==='income').length} entrada(s) confirmada(s)`;
  $('#planning-budget').innerHTML=`<h2>Orçamento de ${esc($('#period-label').textContent)}</h2><div class="budget-details"><p>Limite de despesas<strong>${settings.spendingLimit?F.money(settings.spendingLimit):'Não definido'}</strong></p><p>Meta de receitas<strong>${settings.incomeGoal?F.money(settings.incomeGoal):'Não definida'}</strong></p></div><p class="muted small">${settings.inherited?'Referência inicial do perfil. Personalize este mês sem alterar os anteriores.':'Orçamento específico deste mês.'}</p><button class="secondary" data-budget>Editar orçamento do mês</button>`;
  const savings=query('SELECT * FROM savings WHERE user_id=? AND deletedAt IS NULL ORDER BY targetDate',[user.id]);
  $('#savings-list').innerHTML=savings.map(goal=>{
    const months=Math.max(1,(Number(goal.targetDate.slice(0,4))-new Date().getFullYear())*12+Number(goal.targetDate.slice(5,7))-new Date().getMonth());
    const missing=Math.max(0,Math.round(goal.target*100)-Math.round(goal.saved*100))/100;
    return `<article class="saving-card"><div class="panel-heading"><h3>${esc(goal.name)}</h3><div class="row-actions"><button class="icon-button" data-saving="${goal.id}" aria-label="Editar objetivo ${esc(goal.name)}">✎</button><button class="icon-button" data-delete-saving="${goal.id}" aria-label="Excluir objetivo ${esc(goal.name)}">×</button></div></div><strong>${F.money(goal.saved)} <span class="muted small">de ${F.money(goal.target)}</span></strong><div class="budget-track"><span style="width:${Math.min(100,goal.saved/goal.target*100)}%"></span></div><p class="muted small">${missing?`${F.money(missing/months)} por mês para chegar ao objetivo até ${dateLabel(goal.targetDate)}.`:'Objetivo alcançado.'}</p></article>`;
  }).join('')||empty('O que você quer conquistar?','Crie um objetivo para acompanhar a reserva, uma viagem ou outro plano.');
  $('#category-list').innerHTML=categories.map(c=>`<button class="category-chip" data-rename-category="${c.id}">${esc(c.name)} <span aria-hidden="true">✎</span></button>`).join('');
  const trash=[];
  for(const table of ['transactions','goals','savings']) for(const row of query(`SELECT * FROM ${table} WHERE user_id=? AND deletedAt IS NOT NULL ORDER BY deletedAt DESC`,[user.id]))trash.push({...row,table});
  trash.sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt));
  $('#trash-list').innerHTML=trash.map(row=>`<div class="transaction-row"><div class="row-info"><p class="row-title">${esc(row.description||row.name)}</p><p class="row-meta">${row.table==='goals'?'Conta prevista':row.table==='savings'?'Objetivo':'Movimentação'} · ${new Date(row.deletedAt).toLocaleDateString('pt-BR')}</p></div><button class="text-button" data-restore="${row.id}" data-table="${row.table}">Restaurar</button></div>`).join('')||empty('A lixeira está vazia.','Registros excluídos poderão ser recuperados aqui.');
  const trend=[];
  for(let i=5;i>=0;i--){const month=F.addMonths(`${period}-01`,-i).slice(0,7);const sum=totals(allTransactions.filter(t=>t.date.startsWith(month)));trend.push(`<tr><th scope="row">${new Date(`${month}-01T12:00:00`).toLocaleDateString('pt-BR',{month:'short',year:'numeric'})}</th><td>${F.money(sum.income)}</td><td>${F.money(sum.expense)}</td><td class="${sum.income>=sum.expense?'positive':'negative'}">${F.money(sum.income-sum.expense)}</td></tr>`);}
  $('#monthly-trend').innerHTML=`<div class="table-scroll"><table><caption>Últimos seis meses · pagamentos e recebimentos confirmados</caption><thead><tr><th>Mês</th><th>Receitas</th><th>Despesas</th><th>Resultado</th></tr></thead><tbody>${trend.join('')}</tbody></table></div>`;
  renderTransactions();
}
function field(label,name,type,value='',attrs='') {return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs} required></label>`;}
function categoryField(selected='') {
  const names=[...new Set([...categories.map(c=>c.name),selected,'Outros','Contas'].filter(Boolean))];
  return `<label>Categoria<select name="category">${names.map(name=>`<option value="${esc(name)}" ${name===selected?'selected':''}>${esc(name)}</option>`).join('')}</select></label>`;
}
function typeField(selected='expense') {return `<label>Tipo<select name="type"><option value="expense" ${selected==='expense'?'selected':''}>Despesa</option><option value="income" ${selected==='income'?'selected':''}>Receita</option></select></label>`;}
function openEditor(title,html,action,submit='Salvar') {
  $('#dialog-fields').oninput=null;
  $('#dialog-title').textContent=title;$('#dialog-fields').innerHTML=html;$('#dialog-error').textContent='';$('#dialog-submit').textContent=submit;editorAction=action;editorDirty=false;
  $('#dialog').showModal();
  $('#dialog-fields').querySelector('input:not([type=checkbox]),select')?.focus();
}
function newTransaction(id) {
  const tx=id?allTransactions.find(t=>t.id===id):null;
  openEditor(tx?'Editar movimentação':'Nova movimentação',`${field('Descrição','description','text',tx?.description||'','maxlength="150" placeholder="Ex.: Mercado da semana"')}<div class="form-grid">${field(tx?'Valor (R$)':'Valor total (R$)','amount','number',tx?.amount||'','min="0.01" max="999999999" step="0.01" inputmode="decimal"')}${field('Data','date','date',tx?.date||F.iso(new Date()))}</div><div class="form-grid">${typeField(tx?.type)}${categoryField(tx?.category)}</div>${tx?`<p class="field-hint">${tx.sourceGoalId?'Esta movimentação é a baixa de uma conta. Excluí-la reabre a conta prevista.':'Esta movimentação já está confirmada.'}</p>`:`<label>Situação<select name="settlement"><option value="completed">Já foi pago/recebido</option><option value="pending">Ainda será pago/recebido</option></select></label>${field('Número de parcelas','count','number','1','min="1" max="360" step="1"')}<p class="field-hint" id="installment-preview">Uma movimentação única.</p>`}`,async data=>{
    await store.saveTransaction(user.id,data,id||null);period=data.date.slice(0,7);refresh();
    notify(tx?'Movimentação atualizada.':data.settlement==='pending'?'Conta adicionada às previsões.':Number(data.count)>1?'Primeira parcela registrada. As demais aguardam baixa em Contas previstas.':'Movimentação confirmada.');
  });
  if(!tx) {
    const fields=$('#dialog-fields');
    const update=()=>{try{const data=Object.fromEntries(new FormData($('#editor')));const parts=F.installments(Number(data.amount),Number(data.count),data.date);$('#installment-preview').textContent=parts.length===1?'Um lançamento único.':`${parts.length} parcelas. Primeira: ${F.money(parts[0].amount)} em ${dateLabel(parts[0].date)}. Última: ${F.money(parts.at(-1).amount)} em ${dateLabel(parts.at(-1).date)}. As parcelas seguintes ficam pendentes até a baixa.`;}catch{$('#installment-preview').textContent='Preencha valor, data e quantidade para ver as parcelas.';}};
    fields.oninput=update;
    fields.querySelector('[name=date]').addEventListener('change',event=>{if(event.target.value>F.iso(new Date()))fields.querySelector('[name=settlement]').value='pending';update();});
  }
}
function newGoal(id) {
  const goal=id?pending.find(g=>g.id===id):null;
  openEditor(goal?'Editar conta prevista':'Adicionar conta',`${field('Descrição','description','text',goal?.description||'','maxlength="150" placeholder="Ex.: Aluguel"')}<div class="form-grid">${field('Valor de cada conta (R$)','amount','number',goal?.amount||'','min="0.01" max="999999999" step="0.01" inputmode="decimal"')}${field('Vencimento','date','date',goal?.dueDate||F.iso(new Date()))}</div><div class="form-grid">${typeField(goal?.type)}${categoryField(goal?.category)}</div>${goal?'<p class="field-hint">A edição altera somente esta ocorrência, sem mexer nas outras contas da série.</p>':`${field('Repetir mensalmente por quantos meses?','repeat','number','1','min="1" max="120" step="1"')}<p class="field-hint">Use 1 para uma conta única. Cada repetição mantém o valor integral; não é uma divisão em parcelas.</p>`}`,async data=>{await store.saveGoal(user.id,data,id||null);refresh();notify(goal?'Conta atualizada.':'Contas adicionadas ao planejamento.');});
}
function payGoal(id) {
  const goal=pending.find(g=>g.id===id);if(!goal)return;
  openEditor(goal.type==='income'?'Confirmar recebimento':'Confirmar pagamento',`<p class="delete-copy">${esc(goal.description)} · Previsto: ${F.money(goal.amount)}</p><div class="form-grid">${field('Valor efetivo (R$)','amount','number',goal.amount,'min="0.01" max="999999999" step="0.01" inputmode="decimal"')}${field('Data da baixa','date','date',F.iso(new Date()),`max="${F.iso(new Date())}"`)}</div><p class="field-hint">Informe o valor total efetivamente pago ou recebido, já com eventual ajuste. A conta será encerrada e o valor entrará no histórico dessa data. Para pagamentos parciais, divida a conta antes da baixa.</p>`,async data=>{await store.payGoal(user.id,id,data.date,Number(data.amount));refresh();notify('Baixa confirmada uma única vez no histórico.');},'Confirmar baixa');
}
function confirmDelete(id,goal=false) {
  const row=(goal?pending:allTransactions).find(t=>t.id===id);if(!row)return;
  openEditor('Mover para a lixeira?',`<p class="delete-copy">${esc(row.description)} · ${F.money(row.amount)}<br>Você poderá restaurar este registro em Dados e ajustes.${!goal&&row.sourceGoalId?'<br>A conta prevista voltará a ficar pendente.':''}</p>${goal&&row.seriesId?'<label class="check-label"><input name="wholeSeries" type="checkbox">Excluir também as outras contas pendentes desta série</label>':''}`,async data=>{await store.remove(user.id,id,goal,data.wholeSeries==='on');refresh();notify('Registro movido para a lixeira.');},'Mover para a lixeira');
}
function editBudget() {
  const budget=store.budget(user.id,period);
  openEditor('Orçamento deste mês',`<p class="muted">${esc($('#period-label').textContent)}</p>${field('Limite de despesas (R$)','limit','number',budget.spendingLimit,'min="0" max="999999999" step="0.01" inputmode="decimal"')}${field('Meta de receitas (R$)','goal','number',budget.incomeGoal,'min="0" max="999999999" step="0.01" inputmode="decimal"')}<p class="field-hint">Apenas o mês selecionado será alterado. Use zero para deixar uma referência sem definição.</p>`,async data=>{await store.saveBudget(user.id,period,Number(data.limit),Number(data.goal));refresh();notify('Orçamento do mês atualizado.');});
}
function editSaving(id) {
  const goal=id?query('SELECT * FROM savings WHERE user_id=? AND id=?',[user.id,id])[0]:null;
  openEditor(goal?'Atualizar objetivo':'Novo objetivo',`${field('Nome do objetivo','name','text',goal?.name||'','maxlength="100" placeholder="Ex.: Reserva de emergência"')}<div class="form-grid">${field('Quanto quer juntar (R$)','target','number',goal?.target||'','min="0.01" max="999999999" step="0.01"')}${field('Quanto já guardou (R$)','saved','number',goal?.saved||0,'min="0" max="999999999" step="0.01"')}</div>${field('Prazo desejado','targetDate','date',goal?.targetDate||F.addMonths(F.iso(new Date()),12))}<p class="field-hint">Acompanhamento manual: atualizar um objetivo não cria receita ou despesa e não movimenta dinheiro.</p>`,async data=>{await store.saveSaving(user.id,data,id||null);refresh();notify('Objetivo atualizado.');});
}
function editCategory(id) {
  const category=categories.find(c=>c.id===id);
  openEditor(category?'Renomear categoria':'Nova categoria',`${field('Nome','name','text',category?.name||'','maxlength="60"')}<p class="field-hint">${category?'O nome também será atualizado nos lançamentos e contas deste perfil.':'A categoria ficará disponível nos formulários de receitas e despesas.'}</p>`,async data=>{await store.category(user.id,data.name,category?.name);refresh();notify('Categoria salva.');});
}
function closeEditor() {
  if($('#dialog-submit').disabled)return;
  if(editorDirty&&!window.confirm('Descartar as alterações que ainda não foram salvas?'))return;
  $('#dialog').close();
}
$('#editor').addEventListener('input',()=>editorDirty=true);
$('#dialog').addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
$('#editor').addEventListener('submit',async event=>{
  event.preventDefault();if($('#dialog-submit').disabled)return;
  $('#dialog-submit').disabled=true;
  try{await editorAction(Object.fromEntries(new FormData(event.target)));editorDirty=false;$('#dialog').close();}
  catch(error){$('#dialog-error').textContent=error.message;}
  finally{$('#dialog-submit').disabled=false;}
});
$('#close-dialog').onclick=$('#cancel-dialog').onclick=closeEditor;
$('#login-form').onsubmit=event=>{event.preventDefault();loginAccount();};
$('#signup-form').onsubmit=event=>{event.preventDefault();signupAccount();};
$('#open-signup').onclick=()=>setAuthScreen('signup');
$('#open-login').onclick=()=>setAuthScreen('login');
document.querySelectorAll('[data-password-toggle]').forEach(button=>button.onclick=()=>{
  const input=document.getElementById(button.dataset.passwordToggle),show=input.type==='password';
  input.type=show?'text':'password';button.setAttribute('aria-pressed',String(show));
  button.setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');button.title=show?'Ocultar senha':'Mostrar senha';
});
$('#new-transaction').onclick=()=>newTransaction();$('#new-goal').onclick=()=>newGoal();$('#new-saving').onclick=()=>editSaving();$('#new-category').onclick=()=>editCategory();$('#settings').onclick=editBudget;
document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  try {
    if(button.dataset.view)setView(button.dataset.view);
    if(button.hasAttribute('data-create'))newTransaction();
    if(button.hasAttribute('data-budget'))editBudget();
    if(button.dataset.edit)newTransaction(Number(button.dataset.edit));
    if(button.dataset.editGoal)newGoal(Number(button.dataset.editGoal));
    if(button.dataset.delete)confirmDelete(Number(button.dataset.delete));
    if(button.dataset.deleteGoal)confirmDelete(Number(button.dataset.deleteGoal),true);
    if(button.dataset.pay)payGoal(Number(button.dataset.pay));
    if(button.dataset.saving)editSaving(Number(button.dataset.saving));
    if(button.dataset.renameCategory)editCategory(Number(button.dataset.renameCategory));
    if(button.dataset.restore){button.disabled=true;await store.restoreRow(user.id,Number(button.dataset.restore),button.dataset.table);refresh();notify('Registro restaurado.');}
    if(button.dataset.deleteSaving){const id=Number(button.dataset.deleteSaving);openEditor('Excluir objetivo?','<p class="delete-copy">O objetivo irá para a lixeira e poderá ser restaurado.</p>',async()=>{await change(()=>db.run('UPDATE savings SET deletedAt=? WHERE user_id=? AND id=?',[new Date().toISOString(),user.id,id]));refresh();},'Mover para a lixeira');}
  }catch(error){notify(error.message);button.disabled=false;}
});
function selectMonth(month){if(/^\d{4}-(0[1-9]|1[0-2])$/.test(month)){period=month;refresh();}}
$('#previous-month').onclick=()=>selectMonth(F.addMonths(`${period}-01`,-1).slice(0,7));$('#next-month').onclick=()=>selectMonth(F.addMonths(`${period}-01`,1).slice(0,7));$('#today').onclick=()=>selectMonth(F.iso(new Date()).slice(0,7));$('#month-jump').onchange=event=>selectMonth(event.target.value);
$('#search').oninput=renderTransactions;$('#type-filter').onchange=$('#category-filter').onchange=$('#all-history').onchange=renderTransactions;
$('#goal-filter').onchange=$('#goal-search').oninput=renderGoals;
function backup(){if(demo){notify('A demonstração não gera backup dos seus dados.');return;}download(store.export(),`gestor-backup-${F.iso(new Date())}.sqlite`,'application/vnd.sqlite3');notify('Backup gerado. Guarde o arquivo: ele contém todos os perfis deste dispositivo.');}
$('#backup').onclick=$('#backup-main').onclick=backup;
const mobileBackup=document.createElement('button');mobileBackup.className='text-button mobile-backup';mobileBackup.textContent='Baixar backup ↗';mobileBackup.onclick=backup;$('.main-footer').appendChild(mobileBackup);
async function importBackup(file) {
  if(!file)return;
  try {
    if(demo)throw new Error('Saia da demonstração para restaurar seus dados.');
    if(file.size>25*1024*1024)throw new Error('O arquivo ultrapassa o limite de 25 MB.');
    const preview=store.inspectBackup(new Uint8Array(await file.arrayBuffer()));
    openEditor('Restaurar backup',`<p class="delete-copy">O arquivo contém <strong>${preview.users} perfil(is), ${preview.transactions} movimentação(ões) e ${preview.goals} conta(s) pendente(s)</strong>.</p><p class="delete-copy">A restauração substitui os dados atuais deste dispositivo. Não mescla nem duplica registros. Depois, entre com o email e a senha do perfil do backup.</p><label class="check-label"><input type="checkbox" name="acknowledge" required>Guardei uma cópia dos dados atuais ou não preciso deles. Quero substituí-los.</label>`,async data=>{if(data.acknowledge!=='on')throw new Error('Confirme a substituição dos dados.');await store.restoreBackup(preview.bytes);localStorage.removeItem('user');location.reload();},'Substituir e restaurar');
  }catch(error){notify(`Backup não restaurado. ${error.message}`);}
}
$('#restore-file').onchange=event=>{importBackup(event.target.files[0]);event.target.value='';};
$('#restore-backup').onclick=$('#restore-auth').onclick=()=>$('#restore-file').click();
$('#export-csv').onclick=()=>{
  const cell=value=>`"${String(value??'').replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')}"`;
  const rows=[['Data','Descrição','Categoria','Tipo','Valor'],...filteredRows().map(t=>[t.date,t.description,t.category,t.type==='income'?'Receita':'Despesa',t.amount.toFixed(2).replace('.',',')])];
  download('\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n'),`gestor-${$('#all-history').checked?'historico':period}.csv`,'text/csv;charset=utf-8');
};
$('#debt-form').onsubmit=event=>{
  event.preventDefault();$('#debt-result').hidden=false;debtResult=null;
  try{
    const data=Object.fromEntries(new FormData(event.target)),result=F.debt(Number(data.amount),Number(data.rate),Number(data.payment));debtResult=result;
    $('#debt-result').innerHTML=`<strong>${result.schedule.length} meses para quitar</strong><p>Total pago: ${F.money(result.total)}</p><p>Juros no período: ${F.money(result.interest)}</p><p>Última parcela: ${F.money(result.schedule.at(-1).amount)}</p><button class="text-button" id="save-debt">Adicionar parcelas às contas previstas →</button>`;
    $('#save-debt').onclick=()=>{
      const schedule=debtResult.schedule;
      openEditor('Planejar parcelas da dívida',`${field('Descrição','description','text','','maxlength="120" placeholder="Ex.: Empréstimo"')}${field('Primeiro vencimento','date','date',F.iso(new Date()))}<p class="field-hint">Serão criadas ${schedule.length} contas pendentes, totalizando ${F.money(result.total)}. O histórico só será atualizado quando você der baixa.</p>`,async data=>{
        if(!data.description.trim()||!F.validDate(data.date))throw new Error('Informe a descrição e uma data válida.');
        const series=`divida-${crypto.randomUUID()}`;
        await change(()=>schedule.forEach((part,i)=>db.run('INSERT INTO goals (user_id,description,amount,dueDate,type,status,category,seriesId) VALUES (?,?,?,?,?,?,?,?)',[user.id,`${data.description.trim()} (${i+1}/${schedule.length})`,part.amount,F.addMonths(data.date,i),'expense','pending','Dívidas',series])));
        refresh();$('#debt-result').hidden=true;debtResult=null;notify('Parcelas adicionadas às contas previstas.');
      });
    };
  }catch(error){$('#debt-result').textContent=error.message;}
};
$('#debt-form').oninput=()=>{$('#debt-result').hidden=true;debtResult=null;};
$('#income-form').onsubmit=event=>{event.preventDefault();$('#income-result').hidden=false;try{const data=Object.fromEntries(new FormData(event.target)),result=F.income(Number(data.amount),Number(data.growth),Number(data.months));$('#income-result').innerHTML=`<strong>Total projetado: ${F.money(result.total)}</strong><p>Receita no último mês: ${F.money(result.last)}</p><p>Média mensal: ${F.money(result.average)}</p>`;}catch(error){$('#income-result').textContent=error.message;}};
$('#income-form').oninput=()=>$('#income-result').hidden=true;
function logout(){if(!demo)localStorage.removeItem('user');location.reload();}$('#logout').onclick=$('#exit-demo').onclick=logout;
window.addEventListener('storage',event=>{if(event.key==='db'&&!demo&&store&&event.newValue!==store.baseline){$('#stale-banner').hidden=false;}});
$('#reload-data').onclick=()=>{if($('#dialog').open&&editorDirty&&!window.confirm('Recarregar descarta as alterações ainda não salvas. Continuar?'))return;location.reload();};
$('#demo').onclick=async()=>{
  demo=true;store.db.close();store=new D.FinanceStore(SQL,memoryStorage());db=store.db;
  db.run("INSERT INTO users (username,email,password) VALUES ('marina','marina@exemplo.com','demo')");user={id:1,username:'marina',email:'marina@exemplo.com'};defaults(1);
  db.run('UPDATE settings SET spendingLimit=3500,incomeGoal=6500 WHERE user_id=1');
  const seed=[['Salário',5800,'income','Salário',2],['Projeto freelance',850,'income','Outros',9],['Aluguel',1400,'expense','Moradia',5],['Mercado da semana',286.4,'expense','Alimentação',8],['Café com amigos',48.5,'expense','Lazer',10],['Internet',119.9,'expense','Moradia',11],['Combustível',180,'expense','Transporte',14],['Feira de sábado',95.6,'expense','Alimentação',17],['Cinema',64,'expense','Lazer',21],['Farmácia',72.8,'expense','Saúde',24]];
  seed.forEach(([description,amount,type,category,day])=>{
    const date=`${period}-${String(day).padStart(2,'0')}`;
    if(date<=F.iso(new Date()))db.run('INSERT INTO transactions (user_id,description,amount,date,type,category) VALUES (?,?,?,?,?,?)',[1,description,amount,date,type,category]);
    else db.run('INSERT INTO goals (user_id,description,amount,dueDate,type,status,category) VALUES (?,?,?,?,?,?,?)',[1,description,amount,date,type,'pending',category]);
  });
  db.run('INSERT INTO savings (user_id,name,target,saved,targetDate) VALUES (?,?,?,?,?)',[1,'Reserva de emergência',18000,6200,F.addMonths(F.iso(new Date()),12)]);
  await showApp();
};
async function start(){
  try{
    if(typeof initSqlJs!=='function')throw new Error('A biblioteca do banco não carregou. Confira a conexão e tente novamente.');
    SQL=await initSqlJs({locateFile:file=>`vendor/${file}`});
    const lock=navigator.locks?operation=>navigator.locks.request('gestor-write',operation):undefined;
    store=new D.FinanceStore(SQL,localStorage,{lock});db=store.db;
    let session;try{session=JSON.parse(localStorage.getItem('user')||'null');}catch{localStorage.removeItem('user');}
    if(session){const existing=query('SELECT id,username,email FROM users WHERE id=?',[session.id])[0];if(existing){user=existing;localStorage.setItem('user',JSON.stringify(user));await showApp();}else localStorage.removeItem('user');}
    if(!user)$('#auth').hidden=false;$('#loading').hidden=true;
  }catch(error){
    $('#app').hidden=true;
    $('#loading').innerHTML=`<h2>Não foi possível abrir o Gestor.</h2><p>${esc(error.message)}</p><p class="muted small">Os dados existentes não foram apagados.</p><button class="primary" id="retry">Tentar novamente</button>${SQL?'<button class="secondary" id="recover-backup">Restaurar um backup</button>':''}`;
    $('#retry').onclick=()=>location.reload();
    if(SQL){store=new D.FinanceStore(SQL,memoryStorage());store.storage=localStorage;store.baseline=localStorage.getItem('db');$('#recover-backup').onclick=()=>$('#restore-file').click();}
  }
}
start();
