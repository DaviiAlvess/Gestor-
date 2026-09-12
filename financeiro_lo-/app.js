/* O banco mantém as tabelas e a chave "db" da versão anterior. */
'use strict';
const $ = selector => document.querySelector(selector);
const F = Finance;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const dateLabel = value => new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
let SQL, db, user, demo = false, period = F.iso(new Date()).slice(0,7), activeView = 'overview', allTransactions = [], pending = [], settings, categories = [], editorAction, debtResult, toastTimer;
const schema = `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE,password TEXT);
CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,description TEXT,amount REAL,date TEXT,type TEXT,category TEXT);
CREATE TABLE IF NOT EXISTS goals (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,description TEXT,amount REAL,dueDate TEXT,type TEXT,status TEXT);
CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT,isEssential INTEGER);
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,spendingLimit REAL,incomeGoal REAL);`;
function query(sql, params = []) { const stmt = db.prepare(sql); try { stmt.bind(params); const rows = []; while(stmt.step()) rows.push(stmt.getAsObject()); return rows; } finally { stmt.free(); } }
function encodedDB() { const bytes = db.export(); let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(binary); }
function persist() { if (!demo) localStorage.setItem('db', encodedDB()); }
function change(action) {
  const snapshot = db.export();
  try { db.run('BEGIN TRANSACTION'); action(); db.run('COMMIT'); persist(); }
  catch (error) { db.close(); db = new SQL.Database(snapshot); throw new Error(`Não foi possível salvar. Nenhuma alteração foi aplicada. ${error.message}`); }
}
function notify(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, 4500); }
function download(content, filename, type) { const url = URL.createObjectURL(new Blob([content],{type})); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
async function passwordHash(password, salt) {
  if (!crypto.subtle) throw new Error('Abra pelo servidor local (localhost) para criar ou acessar seu perfil.');
  salt ||= Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2,'0')).join('');
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', salt:new TextEncoder().encode(salt), iterations:210000, hash:'SHA-256' },key,256);
  return `pbkdf2$${salt}$${Array.from(new Uint8Array(bits),b => b.toString(16).padStart(2,'0')).join('')}`;
}
function defaults(id) {
  ['Alimentação','Transporte','Moradia','Saúde','Lazer','Salário','Dívidas','Outros'].forEach(name => db.run('INSERT INTO categories (user_id,name,isEssential) VALUES (?,?,?)',[id,name,['Alimentação','Moradia','Saúde','Transporte'].includes(name)?1:0]));
  db.run('INSERT INTO settings (user_id,spendingLimit,incomeGoal) VALUES (?,?,?)',[id,3000,5000]);
}
async function authenticate(signup) {
  if (!$('#auth-form').reportValidity()) return;
  $('#auth-error').textContent = ''; $('#login').disabled = $('#signup').disabled = true;
  try {
    const email = $('#email').value.trim().toLowerCase(), password = $('#password').value;
    let match = query('SELECT * FROM users WHERE lower(email) = ?',[email])[0];
    if (signup) {
      if (match) throw new Error('Já existe um perfil com este e-mail neste navegador.');
      const hash = await passwordHash(password);
      change(() => { db.run('INSERT INTO users (email,password) VALUES (?,?)',[email,hash]); const id = query('SELECT last_insert_rowid() AS id')[0].id; defaults(id); });
      match = query('SELECT * FROM users WHERE email = ?',[email])[0];
    } else {
      if (!match) throw new Error('E-mail ou senha não conferem.');
      const valid = match.password.startsWith('pbkdf2$') ? await passwordHash(password,match.password.split('$')[1]) === match.password : match.password === password;
      if (!valid) throw new Error('E-mail ou senha não conferem.');
      if (!match.password.startsWith('pbkdf2$')) { const hash = await passwordHash(password); change(() => db.run('UPDATE users SET password = ? WHERE id = ?',[hash,match.id])); }
    }
    user = {id:match.id,email:match.email}; localStorage.setItem('user',JSON.stringify(user)); $('#password').value = ''; showApp();
  } catch(error) { $('#auth-error').textContent = error.message; }
  finally { $('#login').disabled = $('#signup').disabled = false; }
}
function showApp() {
  $('#auth').hidden = true; $('#app').hidden = false; $('#demo-banner').hidden = !demo;
  $('#save-label').textContent = demo ? 'Demonstração · não salva' : 'Salvo neste navegador';
  $('#profile-name').textContent = demo ? 'Perfil de exemplo' : user.email;
  $('#avatar').textContent = user.email.slice(0,1).toUpperCase();
  change(() => { if (!query('SELECT id FROM settings WHERE user_id = ?',[user.id]).length) defaults(user.id); });
  refresh(); setView('overview');
}
function monthRows() { return allTransactions.filter(t => t.date.startsWith(period)); }
function totals(rows) { return { income:rows.filter(t => t.type === 'income').reduce((s,t) => s + Math.round(t.amount*100),0)/100, expense:rows.filter(t => t.type === 'expense').reduce((s,t) => s + Math.round(t.amount*100),0)/100 }; }
function refresh() {
  allTransactions = query('SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC,id DESC',[user.id]);
  pending = query("SELECT * FROM goals WHERE user_id = ? AND status = 'pending' ORDER BY dueDate,id",[user.id]);
  settings = query('SELECT * FROM settings WHERE user_id = ?',[user.id])[0];
  categories = query('SELECT * FROM categories WHERE user_id = ? ORDER BY name',[user.id]);
  render();
}
const views = {overview:['Visão geral','Seu mês, em perspectiva.','Tudo o que você precisa acompanhar, em um só lugar.'],transactions:['Movimentações','Cada movimento, registrado.','Encontre, organize e revise as entradas e saídas do mês.'],goals:['Contas previstas','Um passo à frente.','Acompanhe o que está por vencer e o que você tem a receber.'],reports:['Relatórios','Entenda seus números.','Veja como suas escolhas se distribuem ao longo do mês.'],calculator:['Simulador','Faça as contas do futuro.','Explore prazos e possibilidades antes do próximo passo.']};
function setView(view) {
  if (!views[view]) return; activeView = view;
  document.querySelectorAll('.view').forEach(el => el.hidden = el.id !== view);
  document.querySelectorAll('.nav-item').forEach(el => { el.classList.toggle('active',el.dataset.view === view); if (el.dataset.view === view) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current'); });
  $('#breadcrumb').textContent = views[view][0]; $('#page-title').textContent = views[view][1]; $('#page-description').textContent = views[view][2];
  $('.period-toolbar').hidden = ['goals','calculator'].includes(view);
}
function empty(title, detail, action = '') { return `<div class="empty-state"><strong>${title}</strong>${detail}${action}</div>`; }
function transactionRow(t, actions = false) {
  const incoming = t.type === 'income';
  return `<div class="transaction-row"><span class="row-icon ${incoming?'income':'expense'}" aria-hidden="true">${incoming?'↙':'↗'}</span><div class="row-info"><p class="row-title">${esc(t.description)}</p><p class="row-meta">${esc(t.category || 'Outros')} · ${dateLabel(t.date)}</p></div><strong class="row-value ${incoming?'positive':'negative'}">${incoming?'+':'−'} ${F.money(t.amount)}</strong>${actions?`<div class="row-actions"><button class="icon-button" data-edit="${t.id}" aria-label="Editar ${esc(t.description)}">✎</button><button class="icon-button" data-delete="${t.id}" aria-label="Excluir ${esc(t.description)}">×</button></div>`:''}</div>`;
}
function filteredRows() { const search = $('#search').value.toLocaleLowerCase('pt-BR'); const type = $('#type-filter').value; return monthRows().filter(t => (type === 'all' || t.type === type) && `${t.description} ${t.category}`.toLocaleLowerCase('pt-BR').includes(search)); }
function renderTransactions() { const rows = filteredRows(); $('#transactions-list').innerHTML = rows.map(t => transactionRow(t,true)).join('') || empty('Nenhuma movimentação encontrada.','Tente outra busca ou registre a primeira movimentação.'); $('#transaction-count').textContent = `${rows.length} movimentaç${rows.length===1?'ão':'ões'} no período selecionado`; }
function render() {
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
  $('#goals-list').innerHTML = pending.map(g=>`<div class="transaction-row"><span class="row-icon ${g.type==='income'?'income':'expense'}" aria-hidden="true">${g.type==='income'?'↙':'↗'}</span><div class="row-info"><p class="row-title">${esc(g.description)}</p><p class="row-meta ${g.dueDate<F.iso(new Date())?'overdue':''}">${g.type==='income'?'A receber':'A pagar'} · ${dateLabel(g.dueDate)}${g.dueDate<F.iso(new Date())?' · Em atraso':''}</p></div><strong class="row-value">${F.money(g.amount)}</strong><div class="row-actions"><button class="icon-button" data-pay="${g.id}" aria-label="Dar baixa em ${esc(g.description)}">✓</button><button class="icon-button" data-delete-goal="${g.id}" aria-label="Excluir conta ${esc(g.description)}">×</button></div></div>`).join('') || empty('Nada pendente.','Adicione contas a pagar ou receber para se antecipar.');
  renderTransactions(); renderChart(rows); renderReports(rows,income,expense);
}
function renderChart(rows) {
  if (!rows.length) { $('#cash-chart').innerHTML = '<div class="chart-empty"><span>Um novo mês, uma página em branco.</span><small>Seu movimento aparece aqui a cada registro.</small></div>'; return; }
  const days = new Date(Number(period.slice(0,4)),Number(period.slice(5)),0).getDate();
  const buckets = Array.from({length:Math.ceil(days/7)},()=>({income:0,expense:0})); rows.forEach(t => buckets[Math.floor((Number(t.date.slice(-2))-1)/7)][t.type] += t.amount);
  const max = Math.max(1,...buckets.flatMap(b=>[b.income,b.expense]));
  let svg = '<svg viewBox="0 0 540 195" role="img" aria-label="Receitas e despesas por intervalo do mês">';
  [0,.5,1].forEach(r => { const y=155-r*130; svg+=`<line x1="55" y1="${y}" x2="535" y2="${y}" stroke="#edf0e8" stroke-dasharray="3 4"/><text x="0" y="${y+4}">${max*r>=1000?`${(max*r/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mil`:Math.round(max*r)}</text>`; });
  buckets.forEach((b,i) => { const x=80+i*(475/buckets.length), label=`${i*7+1}–${Math.min(days,i*7+7)}`; ['income','expense'].forEach((type,j) => { const height=b[type]/max*130; svg+=`<rect x="${x+j*24}" y="${155-height}" width="17" height="${height}" rx="3" fill="${j?'#cfaa83':'#779362'}"><title>${label}: ${j?'Despesas':'Receitas'} ${F.money(b[type])}</title></rect>`; }); svg+=`<text x="${x+19}" y="183" text-anchor="middle">${label}</text>`; });
  $('#cash-chart').innerHTML = svg+'</svg>';
}
function renderReports(rows,income,expense) {
  $('#report-totals').innerHTML = [['Receitas',income],['Despesas',expense],['Saldo',income-expense]].map(([label,value])=>`<div class="report-total">${label}<strong>${F.money(value)}</strong></div>`).join('');
  const groups = {}; rows.filter(t=>t.type==='expense').forEach(t=>{ const key=t.category||'Outros'; Object.defineProperty(groups,key,{value:(Object.hasOwn(groups,key)?groups[key]:0)+t.amount,writable:true,configurable:true,enumerable:true}); });
  const sorted = Object.entries(groups).sort((a,b)=>b[1]-a[1]);
  $('#category-chart').innerHTML = sorted.map(([name,value])=>`<div class="category-row"><div><span>${esc(name)}</span><strong>${F.money(value)}<small>${Math.round(value/expense*100)}%</small></strong></div><div class="category-track"><span style="width:${value/expense*100}%"></span></div></div>`).join('') || empty('Sem despesas neste mês.','As categorias aparecem quando você registra uma saída.');
  $('#report-insight').innerHTML = `<p class="insight-number">${income?`${Math.round(expense/income*100)}%`:'—'}</p><p class="insight-copy">${income?'das suas receitas foram comprometidas com despesas neste período.':'Registre suas receitas para comparar entradas e saídas.'}</p><hr class="insight-divider"><p class="insight-copy">${sorted.length?`A maior categoria de despesas foi <strong>${esc(sorted[0][0])}</strong>, com ${F.money(sorted[0][1])}.`:'Você ainda não tem despesas para comparar neste período.'}</p><hr class="insight-divider"><p class="insight-copy">Os totais consideram as movimentações registradas. Contas pendentes entram no histórico somente após a baixa.</p>`;
}
function field(label,name,type,value='',attrs='') { return `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs} required></label>`; }
function openEditor(title,html,action,submit='Salvar') { $('#dialog-title').textContent = title; $('#dialog-fields').innerHTML = html; $('#dialog-error').textContent=''; $('#dialog-submit').textContent=submit; editorAction=action; $('#dialog').showModal(); }
function validEntry(data) { if (!String(data.description).trim() || !Number.isFinite(Number(data.amount)) || Number(data.amount)<=0 || !F.validDate(data.date)) throw new Error('Confira a descrição, o valor e a data.'); if (!['income','expense'].includes(data.type)) throw new Error('Selecione o tipo da movimentação.'); }
function newTransaction(id) {
  const tx = id ? allTransactions.find(t=>t.id===id) : null;
  const names = [...new Set([...categories.map(c=>c.name),tx?.category,'Dívidas','Outros'].filter(Boolean))];
  openEditor(tx?'Editar movimentação':'Nova movimentação',`${field('Descrição','description','text',tx?.description||'','maxlength="150" placeholder="Ex.: Mercado da semana"') }<div class="form-grid">${field('Valor total (R$)','amount','number',tx?.amount||'','min="0.01" max="999999999" step="0.01"')}${field('Data','date','date',tx?.date||F.iso(new Date()))}</div><div class="form-grid"><label>Tipo<select name="type"><option value="expense" ${tx?.type!=='income'?'selected':''}>Despesa</option><option value="income" ${tx?.type==='income'?'selected':''}>Receita</option></select></label><label>Categoria<select name="category">${names.map(name=>`<option ${name===tx?.category?'selected':''}>${esc(name)}</option>`).join('')}</select></label></div>${tx?'':`${field('Dividir em parcelas','count','number','1','min="1" max="360" step="1"')}<p class="field-hint">Use 1 para um lançamento único. O valor total será dividido entre os meses, a partir da data escolhida.</p>`}`,data=>{
    validEntry(data); const amount=Number(data.amount);
    if (tx) change(()=>db.run('UPDATE transactions SET description=?,amount=?,date=?,type=?,category=? WHERE id=? AND user_id=?',[data.description.trim(),amount,data.date,data.type,data.category,id,user.id]));
    else { const schedule=F.installments(amount,Number(data.count),data.date); change(()=>schedule.forEach((part,i)=>db.run('INSERT INTO transactions (user_id,description,amount,date,type,category) VALUES (?,?,?,?,?,?)',[user.id,data.description.trim()+(schedule.length>1?` (${i+1}/${schedule.length})`:''),part.amount,part.date,data.type,data.category]))); }
    period=data.date.slice(0,7); refresh(); notify(tx?'Movimentação atualizada.':'Movimentação registrada.');
  });
}
function newGoal() { openEditor('Adicionar conta',`${field('Descrição','description','text','','maxlength="150" placeholder="Ex.: Aluguel"')}<div class="form-grid">${field('Valor (R$)','amount','number','','min="0.01" max="999999999" step="0.01"')}${field('Vencimento','date','date',F.iso(new Date()))}</div><label>Tipo<select name="type"><option value="expense">A pagar</option><option value="income">A receber</option></select></label>`,data=>{ validEntry(data); change(()=>db.run('INSERT INTO goals (user_id,description,amount,dueDate,type,status) VALUES (?,?,?,?,?,?)',[user.id,data.description.trim(),Number(data.amount),data.date,data.type,'pending'])); refresh(); notify('Conta adicionada ao planejamento.'); }); }
function confirmDelete(id,goal=false) { const row = (goal?pending:allTransactions).find(t=>t.id===id); if(!row)return; openEditor(goal?'Excluir conta?':'Excluir movimentação?',`<p class="delete-copy">Você vai excluir <strong>${esc(row.description)}</strong>, de ${F.money(row.amount)}. Esta ação não pode ser desfeita.</p>`,()=>{change(()=>db.run(`DELETE FROM ${goal?'goals':'transactions'} WHERE id=? AND user_id=?`,[id,user.id])); refresh(); notify('Registro excluído.');},'Excluir'); }
function payGoal(id) { const goal=pending.find(g=>g.id===id); if(!goal)return; openEditor(goal.type==='income'?'Confirmar recebimento':'Confirmar pagamento',`<p class="delete-copy">Registrar <strong>${esc(goal.description)}</strong>, de ${F.money(goal.amount)}, no histórico de hoje (${dateLabel(F.iso(new Date()))})?</p>`,()=>{change(()=>{db.run('INSERT INTO transactions (user_id,description,amount,date,type,category) VALUES (?,?,?,?,?,?)',[user.id,goal.description,goal.amount,F.iso(new Date()),goal.type,'Contas']);db.run("UPDATE goals SET status='completed' WHERE id=? AND user_id=?",[id,user.id]);});refresh();notify('Baixa registrada no histórico.');},'Confirmar baixa'); }
$('#editor').addEventListener('submit',event=>{event.preventDefault();try {editorAction(Object.fromEntries(new FormData(event.target)));$('#dialog').close();}catch(error){$('#dialog-error').textContent=error.message;}});
$('#close-dialog').onclick=$('#cancel-dialog').onclick=()=>$('#dialog').close();
$('#auth-form').onsubmit=event=>{event.preventDefault();authenticate(false);}; $('#signup').onclick=()=>authenticate(true);
$('#new-transaction').onclick=()=>newTransaction(); $('#new-goal').onclick=newGoal;
document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.view)setView(button.dataset.view);if(button.hasAttribute('data-create'))newTransaction();if(button.dataset.edit)newTransaction(Number(button.dataset.edit));if(button.dataset.delete)confirmDelete(Number(button.dataset.delete));if(button.dataset.deleteGoal)confirmDelete(Number(button.dataset.deleteGoal),true);if(button.dataset.pay)payGoal(Number(button.dataset.pay));});
$('#settings').onclick=()=>openEditor('Seu planejamento',`${field('Limite mensal de despesas (R$)','limit','number',settings.spendingLimit,'min="0.01" max="999999999" step="0.01"')}${field('Meta mensal de receitas (R$)','goal','number',settings.incomeGoal,'min="0.01" max="999999999" step="0.01"')}<p class="field-hint">Esses valores de referência são usados em todos os meses.</p>`,data=>{const limit=Number(data.limit),goal=Number(data.goal);if(![limit,goal].every(n=>Number.isFinite(n)&&n>0))throw new Error('Informe valores maiores que zero.');change(()=>db.run('UPDATE settings SET spendingLimit=?,incomeGoal=? WHERE user_id=?',[limit,goal,user.id]));refresh();notify('Planejamento atualizado.');});
$('#previous-month').onclick=()=>{period=F.addMonths(`${period}-01`,-1).slice(0,7);render();}; $('#next-month').onclick=()=>{period=F.addMonths(`${period}-01`,1).slice(0,7);render();}; $('#today').onclick=()=>{period=F.iso(new Date()).slice(0,7);render();};
$('#search').oninput=renderTransactions; $('#type-filter').onchange=renderTransactions;
$('#backup').onclick=()=>{if(demo){notify('O backup está disponível no seu perfil.');return;}download(db.export(),`gestor-backup-${F.iso(new Date())}.sqlite`,'application/vnd.sqlite3');notify('Backup gerado. Ele contém os perfis e registros deste navegador.');};
const mobileBackup = document.createElement('button');
mobileBackup.className = 'text-button mobile-backup'; mobileBackup.textContent = 'Baixar backup ↗'; mobileBackup.onclick = () => $('#backup').click(); $('.main-footer').appendChild(mobileBackup);
$('#export-csv').onclick=()=>{const cell=value=>`"${String(value??'').replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')}"`; const rows=[['Data','Descrição','Categoria','Tipo','Valor'],...filteredRows().map(t=>[t.date,t.description,t.category,t.type==='income'?'Receita':'Despesa',t.amount.toFixed(2).replace('.',',')])];download('\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n'),`gestor-${period}.csv`,'text/csv;charset=utf-8');};
$('#debt-form').onsubmit=event=>{event.preventDefault();$('#debt-result').hidden=false;debtResult=null;try{const data=Object.fromEntries(new FormData(event.target)),result=F.debt(Number(data.amount),Number(data.rate),Number(data.payment));debtResult=result;$('#debt-result').innerHTML=`<strong>${result.schedule.length} meses para quitar</strong><p>Total pago: ${F.money(result.total)}</p><p>Juros no período: ${F.money(result.interest)}</p><p>Última parcela: ${F.money(result.schedule.at(-1).amount)}</p><button class="text-button" id="save-debt">Adicionar parcelas às contas previstas →</button>`;$('#save-debt').onclick=()=>{const schedule=debtResult.schedule;openEditor('Planejar parcelas da dívida',`${field('Descrição','description','text','','maxlength="120" placeholder="Ex.: Empréstimo"')}${field('Primeiro vencimento','date','date',F.iso(new Date()))}<p class="field-hint">Serão criadas ${schedule.length} contas pendentes, totalizando ${F.money(result.total)}. O histórico só será atualizado quando você der baixa.</p>`,data=>{if(!data.description.trim()||!F.validDate(data.date))throw new Error('Informe a descrição e uma data válida.');change(()=>schedule.forEach((part,i)=>db.run('INSERT INTO goals (user_id,description,amount,dueDate,type,status) VALUES (?,?,?,?,?,?)',[user.id,`${data.description.trim()} (${i+1}/${schedule.length})`,part.amount,F.addMonths(data.date,i),'expense','pending'])));refresh();$('#debt-result').hidden=true;debtResult=null;notify('Parcelas adicionadas às contas previstas.');});};}catch(error){$('#debt-result').textContent=error.message;}};
$('#debt-form').oninput=()=>{$('#debt-result').hidden=true;debtResult=null;};
$('#income-form').onsubmit=event=>{event.preventDefault();$('#income-result').hidden=false;try{const data=Object.fromEntries(new FormData(event.target)),result=F.income(Number(data.amount),Number(data.growth),Number(data.months));$('#income-result').innerHTML=`<strong>Total projetado: ${F.money(result.total)}</strong><p>Receita no último mês: ${F.money(result.last)}</p><p>Média mensal: ${F.money(result.average)}</p>`;}catch(error){$('#income-result').textContent=error.message;}};
$('#income-form').oninput=()=>$('#income-result').hidden=true;
function logout(){if(!demo)localStorage.removeItem('user');location.reload();} $('#logout').onclick=$('#exit-demo').onclick=logout;
$('#demo').onclick=()=>{
  demo=true;db.close();db=new SQL.Database();db.run(schema);db.run("INSERT INTO users (email,password) VALUES ('marina@exemplo.com','demo')");user={id:1,email:'marina@exemplo.com'};defaults(1);db.run('UPDATE settings SET spendingLimit=3500,incomeGoal=6500 WHERE user_id=1');
  const seed=[['Salário',5800,'income','Salário',2],['Projeto freelance',850,'income','Outros',9],['Aluguel',1400,'expense','Moradia',5],['Mercado da semana',286.4,'expense','Alimentação',8],['Café com amigos',48.5,'expense','Lazer',10],['Internet',119.9,'expense','Moradia',11],['Combustível',180,'expense','Transporte',14],['Feira de sábado',95.6,'expense','Alimentação',17],['Cinema',64,'expense','Lazer',21],['Farmácia',72.8,'expense','Saúde',24]];
  seed.forEach(([description,amount,type,category,day])=>db.run('INSERT INTO transactions (user_id,description,amount,date,type,category) VALUES (?,?,?,?,?,?)',[1,description,amount,`${period}-${String(day).padStart(2,'0')}`,type,category]));
  [['Conta de luz',164.3,2],['Academia',129.9,5],['Internet',119.9,8]].forEach(([name,amount,days])=>{const date=new Date();date.setDate(date.getDate()+days);db.run('INSERT INTO goals (user_id,description,amount,dueDate,type,status) VALUES (?,?,?,?,?,?)',[1,name,amount,F.iso(date),'expense','pending']);});showApp();
};
async function start(){
  try{
    if(typeof initSqlJs!=='function')throw new Error('A biblioteca do banco não carregou. Confira a conexão e tente novamente.');
    SQL=await initSqlJs({locateFile:file=>`https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`});
    const saved=localStorage.getItem('db');db=saved?new SQL.Database(Uint8Array.from(atob(saved),c=>c.charCodeAt(0))):new SQL.Database();db.run(schema);
    let session;try{session=JSON.parse(localStorage.getItem('user')||'null');}catch{localStorage.removeItem('user');}
    if(session){const existing=query('SELECT id,email FROM users WHERE id=?',[session.id])[0];if(existing){user=existing;localStorage.setItem('user',JSON.stringify(user));showApp();}else localStorage.removeItem('user');}
    if(!user)$('#auth').hidden=false;$('#loading').hidden=true;
  }catch(error){$('#loading').innerHTML=`<h2>Não foi possível abrir o Gestor.</h2><p>${esc(error.message)}</p><p class="muted small">Os dados existentes não foram apagados.</p><button class="primary" id="retry">Tentar novamente</button>`;$('#retry').onclick=()=>location.reload();}
}
start();
