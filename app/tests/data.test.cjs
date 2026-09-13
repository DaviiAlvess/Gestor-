const {test,before}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {FinanceStore,validateAmount}=require('../data.js');
let SQL;
before(async()=>{SQL=await require('../vendor/sql-wasm.js')({locateFile:name=>path.resolve(__dirname,'../vendor',name)});});
function memory(){const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)};}
async function fixture(storage=memory()){
  const store=new FinanceStore(SQL,storage,{today:()=> '2026-09-12'});
  await store.change(db=>{
    db.run("INSERT INTO users (email,password) VALUES ('one@example.test','password'),('two@example.test','password')");
    db.run('INSERT INTO settings (user_id,spendingLimit,incomeGoal) VALUES (1,1000,3000),(2,2000,4000)');
    db.run("INSERT INTO categories (user_id,name,isEssential) VALUES (1,'Moradia',1),(2,'Moradia',1)");
  });
  return store;
}
const entry=(values={})=>({description:'Compra',amount:100,date:'2026-09-12',type:'expense',category:'Moradia',count:1,settlement:'completed',...values});

test('parcelamento confirma apenas a primeira parcela e mantém o restante pendente',async()=>{
  const s=await fixture();await s.saveTransaction(1,entry({count:3}));
  const rows=s.rows(1);assert.equal(rows.transactions.length,1);assert.equal(rows.pending.length,2);
  assert.equal(rows.transactions[0].amount,33.34);
  assert.deepEqual(rows.pending.map(g=>g.amount),[33.33,33.33]);
  assert.deepEqual(rows.pending.map(g=>g.dueDate),['2026-10-12','2026-11-12']);
});
test('recorrência repete o valor integral e preserva o dia no fim do mês',async()=>{
  const s=await fixture();await s.saveGoal(1,entry({date:'2026-01-31',repeat:3}));
  assert.deepEqual(s.rows(1).pending.map(g=>[g.amount,g.dueDate]),[[100,'2026-01-31'],[100,'2026-02-28'],[100,'2026-03-31']]);
});
test('validação acontece antes de gravar qualquer parcela',async()=>{
  const s=await fixture();const original=s.baseline;
  await assert.rejects(s.saveTransaction(1,entry({count:0.5})));
  await assert.rejects(s.saveTransaction(1,entry({date:'2026-09-30'})),/data futura/);
  assert.equal(s.baseline,original);assert.equal(s.rows(1).transactions.length,0);
});
test('baixa usa valor e data efetivos e impede pagamento duplicado',async()=>{
  const s=await fixture();await s.saveGoal(1,entry({date:'2026-09-10'}));const id=s.rows(1).pending[0].id;
  await s.payGoal(1,id,'2026-09-11',105.25);
  await assert.rejects(s.payGoal(1,id,'2026-09-12',100),/já foi baixada/);
  const rows=s.rows(1);assert.equal(rows.pending.length,0);assert.equal(rows.transactions.length,1);assert.equal(rows.transactions[0].amount,105.25);assert.equal(rows.transactions[0].date,'2026-09-11');
});
test('excluir uma baixa reabre a conta, restaurar encerra sem duplicar',async()=>{
  const s=await fixture();await s.saveGoal(1,entry());const goal=s.rows(1).pending[0];await s.payGoal(1,goal.id,'2026-09-12',100);const tx=s.rows(1).transactions[0];
  await s.remove(1,tx.id);assert.equal(s.rows(1).pending.length,1);assert.equal(s.rows(1).transactions.length,0);
  await s.restoreRow(1,tx.id,'transactions');assert.equal(s.rows(1).pending.length,0);assert.equal(s.rows(1).transactions.length,1);
});
test('restaurar pagamento antigo após nova baixa não duplica o valor',async()=>{
  const s=await fixture();await s.saveGoal(1,entry());const goal=s.rows(1).pending[0];await s.payGoal(1,goal.id,'2026-09-12',100);const tx=s.rows(1).transactions[0];await s.remove(1,tx.id);await s.payGoal(1,goal.id,'2026-09-12',100);
  await assert.rejects(s.restoreRow(1,tx.id,'transactions'),/outra baixa/);assert.equal(s.rows(1).transactions.length,1);
});
test('edição e exclusão respeitam o perfil do registro',async()=>{
  const s=await fixture();await s.saveTransaction(1,entry());const tx=s.rows(1).transactions[0];
  await assert.rejects(s.saveTransaction(2,entry({amount:500}),tx.id),/não encontrada/);await assert.rejects(s.remove(2,tx.id),/não encontrado/);assert.equal(s.rows(1).transactions[0].amount,100);
});
test('cancelar série exclui apenas as ocorrências ainda pendentes',async()=>{
  const s=await fixture();await s.saveGoal(1,entry({repeat:3}));const rows=s.rows(1).pending;await s.payGoal(1,rows[0].id,'2026-09-12',100);await s.remove(1,rows[1].id,true,true);assert.equal(s.rows(1).pending.length,0);assert.equal(s.rows(1).transactions.length,1);
});
test('orçamento de um mês não altera meses anteriores nem outro perfil',async()=>{
  const s=await fixture();await s.saveBudget(1,'2026-09',900,5000);await s.saveBudget(1,'2026-10',1500,7000);assert.equal(s.budget(1,'2026-09').spendingLimit,900);assert.equal(s.budget(1,'2026-08').spendingLimit,1000);assert.equal(s.budget(2,'2026-09').spendingLimit,2000);
});
test('falha de armazenamento reverte a operação em memória e no disco',async()=>{
  const storage=memory(),s=await fixture(storage);const before=s.baseline;storage.setItem=()=>{throw Error('Sem espaço');};await assert.rejects(s.saveTransaction(1,entry()),/Nada foi alterado/);assert.equal(s.rows(1).transactions.length,0);assert.equal(storage.getItem('db'),before);
});
test('uma janela desatualizada não sobrescreve o banco de outra',async()=>{
  const storage=memory(),a=await fixture(storage),b=new FinanceStore(SQL,storage,{today:()=> '2026-09-12'});await a.saveTransaction(1,entry());await assert.rejects(b.saveTransaction(1,entry({amount:20})),/outra janela/);const latest=new FinanceStore(SQL,storage,{today:()=> '2026-09-12'});assert.equal(latest.rows(1).transactions.length,1);assert.equal(latest.rows(1).transactions[0].amount,100);
});
test('backup restaura dados e configurações sem mesclar ou duplicar',async()=>{
  const s=await fixture();await s.saveTransaction(1,entry());await s.saveGoal(1,entry({date:'2026-10-01'}));await s.saveBudget(1,'2026-09',1500,4000);await s.saveSaving(1,{name:'Reserva',target:10000,saved:2500,targetDate:'2027-09-12'});const backup=s.export();
  await s.saveTransaction(1,entry({amount:50}));await s.restoreBackup(backup);assert.equal(s.rows(1).transactions.length,1);assert.equal(s.rows(1).pending.length,1);assert.equal(s.budget(1,'2026-09').spendingLimit,1500);assert.equal(s.query('SELECT saved FROM savings')[0].saved,2500);
});
test('backup incompatível ou corrompido não substitui o banco atual',async()=>{
  const s=await fixture(),before=s.baseline;assert.throws(()=>s.inspectBackup(new Uint8Array([1,2,3])));const invalid=new SQL.Database();invalid.run('CREATE TABLE wrong (id INTEGER)');await assert.rejects(s.restoreBackup(invalid.export()),/não é um backup/);assert.equal(s.baseline,before);invalid.close();
});
test('migração mantém os registros antigos e evita duplicar previsões',async()=>{
  const s=await fixture();await s.change(db=>{db.run("DELETE FROM metadata WHERE key='finance-v3'");db.run("INSERT INTO transactions (user_id,description,amount,date,type,category) VALUES (1,'Futura',50,'2026-10-31','expense','Moradia')");});const reopened=new FinanceStore(SQL,s.storage,{today:()=> '2026-09-12'});assert.equal(reopened.rows(1).transactions.length,0);assert.equal(reopened.rows(1).pending.length,1);assert.equal(reopened.query('SELECT status FROM transactions')[0].status,'migrated');await reopened.change(()=>{});const again=new FinanceStore(SQL,s.storage,{today:()=> '2026-09-12'});assert.equal(again.rows(1).pending.length,1);
});
test('migração cria usuários para contas antigas sem perder o email',()=>{
  const legacy=new SQL.Database();
  legacy.run("CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT,email TEXT UNIQUE,password TEXT); INSERT INTO users (email,password) VALUES ('maria@example.test','senha'),('maria@outro.test','senha')");
  const storage=memory();storage.setItem('db',Buffer.from(legacy.export()).toString('base64'));legacy.close();
  const migrated=new FinanceStore(SQL,storage,{today:()=> '2026-09-12'}),accounts=migrated.query('SELECT username,email FROM users ORDER BY id');
  assert.equal(accounts[0].email,'maria@example.test');assert.equal(accounts[0].username,'maria');assert.notEqual(accounts[1].username,'maria');
});
test('renomear categoria atualiza lançamentos e contas apenas do próprio perfil',async()=>{
  const s=await fixture();await s.saveTransaction(1,entry());await s.saveGoal(1,entry());await s.category(1,'Casa','Moradia');assert.equal(s.rows(1).transactions[0].category,'Casa');assert.equal(s.rows(1).pending[0].category,'Casa');assert.equal(s.rows(2).categories[0].name,'Moradia');await assert.rejects(s.category(1,'casa'),/já existe/);
});
test('valores fracionários menores que centavo ou exagerados são rejeitados',()=>{
  for(const value of [NaN,Infinity,-1,0.001,1e15])assert.throws(()=>validateAmount(value));assert.equal(validateAmount(100.25),100.25);assert.equal(validateAmount(0,true),0);
});
test('elementos estáticos usados na inicialização existem e não possuem IDs duplicados',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  for(const required of ['goal-filter','category-filter','goal-search','restore-file','restore-auth','backup-main','new-saving','new-category','month-jump','stale-banner','forecast','planning-budget','savings-list','trash-list','monthly-trend'])assert.ok(ids.includes(required),required);
});
