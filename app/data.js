(function (root) {
  'use strict';
  const F = typeof module !== 'undefined' ? require('./core.js') : root.Finance;
  const MAX_AMOUNT = 999999999;
  const baseSchema = `
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE,email TEXT UNIQUE,password TEXT);
    CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,description TEXT,amount REAL,date TEXT,type TEXT,category TEXT);
    CREATE TABLE IF NOT EXISTS goals (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,description TEXT,amount REAL,dueDate TEXT,type TEXT,status TEXT);
    CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT,isEssential INTEGER);
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,spendingLimit REAL,incomeGoal REAL);
  `;
  function query(db, sql, params = []) {
    const statement = db.prepare(sql);
    try {
      statement.bind(params);
      const result = [];
      while (statement.step()) result.push(statement.getAsObject());
      return result;
    } finally { statement.free(); }
  }
  function encode(db) {
    const bytes = db.export();
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }
  function validateAmount(value, allowZero = false) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < (allowZero ? 0 : 0.01) || number > MAX_AMOUNT || Math.abs(number * 100 - Math.round(number * 100)) > 0.0001) {
      throw new Error('Informe um valor válido, com no máximo duas casas decimais.');
    }
    return Math.round(number * 100) / 100;
  }
  function validateEntry(data) {
    if (typeof data.description !== 'string' || !data.description.trim() || data.description.trim().length > 200) throw new Error('Informe uma descrição de até 200 caracteres.');
    validateAmount(data.amount);
    if (!F.validDate(data.date) || data.date < '1900-01-01' || data.date > '2199-12-31') throw new Error('Informe uma data válida entre 1900 e 2199.');
    if (!['income', 'expense'].includes(data.type)) throw new Error('Selecione receita ou despesa.');
  }
  function migrate(db, today) {
    db.run(baseSchema);
    const add = (table, column, definition) => {
      if (!query(db, `PRAGMA table_info(${table})`).some(c => c.name === column)) db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    };
    add('users', 'username', 'TEXT');
    const usersWithoutName = query(db, "SELECT id,email FROM users WHERE username IS NULL OR trim(username)='' ORDER BY id");
    for (const account of usersWithoutName) {
      const base = String(account.email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 24) || `usuario${account.id}`;
      let username = base.length >= 3 ? base : `usuario${account.id}`;
      let suffix = 1;
      while (query(db, 'SELECT id FROM users WHERE lower(username)=lower(?) AND id<>?', [username, account.id]).length) username = `${base}${suffix++}`.slice(0, 30);
      db.run('UPDATE users SET username=? WHERE id=?', [username, account.id]);
    }
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS users_username_ci ON users(lower(username));');
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS users_email_ci ON users(lower(email));');
    add('transactions', 'status', "TEXT DEFAULT 'completed'");
    add('transactions', 'deletedAt', 'TEXT');
    add('transactions', 'sourceGoalId', 'INTEGER');
    add('goals', 'category', "TEXT DEFAULT 'Contas'");
    add('goals', 'seriesId', 'TEXT');
    add('goals', 'deletedAt', 'TEXT');
    add('goals', 'legacyTransactionId', 'INTEGER');
    db.run(`CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE IF NOT EXISTS monthly_budgets (user_id INTEGER,month TEXT,spendingLimit REAL,incomeGoal REAL,PRIMARY KEY(user_id,month));
      CREATE TABLE IF NOT EXISTS savings (id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,name TEXT,target REAL,saved REAL,targetDate TEXT,deletedAt TEXT);
      CREATE INDEX IF NOT EXISTS tx_user_date ON transactions(user_id,date);
      CREATE INDEX IF NOT EXISTS goals_user_due ON goals(user_id,dueDate);
      CREATE UNIQUE INDEX IF NOT EXISTS unique_legacy_goal ON goals(legacyTransactionId);
      CREATE UNIQUE INDEX IF NOT EXISTS unique_paid_goal ON transactions(user_id,sourceGoalId) WHERE deletedAt IS NULL AND sourceGoalId IS NOT NULL;`);
    if (!query(db, "SELECT value FROM metadata WHERE key='finance-v3'").length) {
      // Lançamentos futuros da versão anterior passam a exigir confirmação de pagamento.
      const future = query(db, "SELECT * FROM transactions WHERE date>? AND status='completed' AND deletedAt IS NULL", [today]);
      for (const tx of future) {
        db.run('INSERT OR IGNORE INTO goals (user_id,description,amount,dueDate,type,status,category,legacyTransactionId) VALUES (?,?,?,?,?,?,?,?)', [tx.user_id, tx.description, tx.amount, tx.date, tx.type, 'pending', tx.category, tx.id]);
        db.run("UPDATE transactions SET status='migrated' WHERE id=?", [tx.id]);
      }
      db.run("INSERT INTO metadata VALUES ('finance-v3',?)", [today]);
    }
  }
  class FinanceStore {
    constructor(SQL, storage, options = {}) {
      this.SQL = SQL;
      this.storage = storage;
      this.today = options.today || (() => F.iso(new Date()));
      this.lock = options.lock || (async operation => operation());
      this.baseline = storage.getItem('db');
      this.db = this.baseline ? new SQL.Database(Uint8Array.from(atob(this.baseline), c => c.charCodeAt(0))) : new SQL.Database();
      migrate(this.db, this.today());
    }
    query(sql, params) { return query(this.db, sql, params); }
    async change(action) {
      return this.lock(async () => {
        if (this.storage.getItem('db') !== this.baseline) throw new Error('Os dados mudaram em outra janela. Recarregue o Gestor antes de salvar para não sobrescrever alterações.');
        const snapshot = this.db.export();
        try {
          this.db.run('BEGIN');
          const result = action(this.db);
          this.db.run('COMMIT');
          const serialized = encode(this.db);
          this.storage.setItem('db', serialized);
          this.baseline = serialized;
          return result;
        } catch (error) {
          this.db.close();
          this.db = new this.SQL.Database(snapshot);
          throw new Error(`Nada foi alterado. ${error.message}`);
        }
      });
    }
    rows(userId) {
      return {
        transactions: this.query("SELECT * FROM transactions WHERE user_id=? AND status='completed' AND deletedAt IS NULL ORDER BY date DESC,id DESC", [userId]),
        pending: this.query("SELECT * FROM goals WHERE user_id=? AND status='pending' AND deletedAt IS NULL ORDER BY dueDate,id", [userId]),
        categories: this.query('SELECT * FROM categories WHERE user_id=? ORDER BY name', [userId]),
      };
    }
    budget(userId, month) {
      const explicit = this.query('SELECT * FROM monthly_budgets WHERE user_id=? AND month=?', [userId, month])[0];
      return explicit || { ...(this.query('SELECT * FROM settings WHERE user_id=? ORDER BY id LIMIT 1', [userId])[0] || { spendingLimit: 0, incomeGoal: 0 }), inherited: true };
    }
    async saveBudget(userId, month, limit, goal) {
      validateAmount(limit, true); validateAmount(goal, true);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês inválido.');
      return this.change(db => db.run('INSERT OR REPLACE INTO monthly_budgets VALUES (?,?,?,?)', [userId, month, Number(limit), Number(goal)]));
    }
    async saveTransaction(userId, data, id = null) {
      validateEntry(data);
      const category = String(data.category || 'Outros').trim().slice(0, 80);
      if (id) {
        if (data.date > this.today()) throw new Error('Uma movimentação confirmada não pode ter data futura. Cadastre-a em Contas previstas.');
        return this.change(db => {
          const current = query(db, "SELECT * FROM transactions WHERE id=? AND user_id=? AND deletedAt IS NULL AND status='completed'", [id, userId])[0];
          if (!current) throw new Error('Movimentação não encontrada.');
          if (current.sourceGoalId && current.type !== data.type) throw new Error('Para mudar o tipo de uma conta paga, exclua a baixa e edite a conta prevista.');
          db.run('UPDATE transactions SET description=?,amount=?,date=?,type=?,category=? WHERE id=? AND user_id=?', [data.description.trim(), Number(data.amount), data.date, data.type, category, id, userId]);
        });
      }
      const count = Number(data.count || 1);
      const parts = F.installments(Number(data.amount), count, data.date);
      if (data.settlement === 'completed' && data.date > this.today()) throw new Error('Para uma data futura, escolha “Ainda será pago/recebido”.');
      const series = parts.length > 1 ? `parcelas-${crypto.randomUUID()}` : null;
      return this.change(db => {
        parts.forEach((part, index) => {
          const description = data.description.trim() + (parts.length > 1 ? ` (${index + 1}/${parts.length})` : '');
          if (index === 0 && data.settlement === 'completed') db.run('INSERT INTO transactions (user_id,description,amount,date,type,category) VALUES (?,?,?,?,?,?)', [userId, description, part.amount, part.date, data.type, category]);
          else db.run('INSERT INTO goals (user_id,description,amount,dueDate,type,status,category,seriesId) VALUES (?,?,?,?,?,?,?,?)', [userId, description, part.amount, part.date, data.type, 'pending', category, series]);
        });
      });
    }
    async saveGoal(userId, data, id = null) {
      validateEntry(data);
      const count = Number(data.repeat || 1);
      if (!Number.isInteger(count) || count < 1 || count > 120) throw new Error('Escolha de 1 a 120 repetições.');
      const category = String(data.category || 'Contas').trim().slice(0,80);
      return this.change(db => {
        if (id) {
          if (!query(db, "SELECT id FROM goals WHERE id=? AND user_id=? AND status='pending' AND deletedAt IS NULL", [id,userId]).length) throw new Error('Esta conta já foi alterada.');
          db.run('UPDATE goals SET description=?,amount=?,dueDate=?,type=?,category=? WHERE id=? AND user_id=?', [data.description.trim(),Number(data.amount),data.date,data.type,category,id,userId]);
        } else {
          const series = count > 1 ? `recorrencia-${crypto.randomUUID()}` : null;
          for (let i=0;i<count;i++) db.run('INSERT INTO goals (user_id,description,amount,dueDate,type,status,category,seriesId) VALUES (?,?,?,?,?,?,?,?)',[userId,data.description.trim(),Number(data.amount),F.addMonths(data.date,i),data.type,'pending',category,series]);
        }
      });
    }
    async payGoal(userId, id, date, amount) {
      validateAmount(amount);
      if (!F.validDate(date) || date > this.today() || date < '1900-01-01') throw new Error('Informe a data em que o pagamento ocorreu, até hoje.');
      return this.change(db => {
        const goal = query(db, "SELECT * FROM goals WHERE id=? AND user_id=? AND status='pending' AND deletedAt IS NULL", [id,userId])[0];
        if (!goal) throw new Error('Esta conta já foi baixada ou excluída.');
        db.run('INSERT INTO transactions (user_id,description,amount,date,type,category,sourceGoalId) VALUES (?,?,?,?,?,?,?)', [userId,goal.description,Number(amount),date,goal.type,goal.category||'Contas',id]);
        db.run("UPDATE goals SET status='completed' WHERE id=? AND user_id=?", [id,userId]);
      });
    }
    async remove(userId, id, goal = false, wholeSeries = false) {
      const table = goal ? 'goals' : 'transactions';
      return this.change(db => {
        const row = query(db, `SELECT * FROM ${table} WHERE id=? AND user_id=? AND deletedAt IS NULL`, [id,userId])[0];
        if (!row) throw new Error('Registro não encontrado.');
        if (goal && row.status !== 'pending') throw new Error('Exclua a movimentação da baixa para reabrir esta conta.');
        if (goal && wholeSeries && row.seriesId) db.run("UPDATE goals SET deletedAt=? WHERE user_id=? AND seriesId=? AND status='pending' AND deletedAt IS NULL", [new Date().toISOString(),userId,row.seriesId]);
        else db.run(`UPDATE ${table} SET deletedAt=? WHERE id=? AND user_id=?`, [new Date().toISOString(),id,userId]);
        if (!goal && row.sourceGoalId) db.run("UPDATE goals SET status='pending' WHERE id=? AND user_id=?", [row.sourceGoalId,userId]);
      });
    }
    async restoreRow(userId,id,table) {
      if (!['transactions','goals','savings'].includes(table)) throw new Error('Tipo de registro inválido.');
      return this.change(db => {
        const row=query(db,`SELECT * FROM ${table} WHERE user_id=? AND id=? AND deletedAt IS NOT NULL`,[userId,id])[0];
        if(!row) throw new Error('Registro não encontrado na lixeira.');
        if(table==='transactions' && row.sourceGoalId) {
          const goal=query(db,'SELECT * FROM goals WHERE user_id=? AND id=?',[userId,row.sourceGoalId])[0];
          if(!goal || goal.deletedAt || goal.status!=='pending') throw new Error('Esta conta foi excluída ou recebeu outra baixa. Revise as contas previstas antes de restaurar.');
          db.run("UPDATE goals SET status='completed' WHERE id=? AND user_id=?",[row.sourceGoalId,userId]);
        }
        db.run(`UPDATE ${table} SET deletedAt=NULL WHERE user_id=? AND id=?`,[userId,id]);
      });
    }
    async category(userId,name,oldName=null) {
      name=String(name).trim();
      if(!name || name.length>60) throw new Error('Use um nome de categoria com até 60 caracteres.');
      return this.change(db=>{
        if(query(db,'SELECT id FROM categories WHERE user_id=? AND lower(name)=lower(?) AND name<>?',[userId,name,oldName||'']).length) throw new Error('Esta categoria já existe.');
        if(oldName) {
          db.run('UPDATE categories SET name=? WHERE user_id=? AND name=?',[name,userId,oldName]);
          db.run('UPDATE transactions SET category=? WHERE user_id=? AND category=?',[name,userId,oldName]);
          db.run('UPDATE goals SET category=? WHERE user_id=? AND category=?',[name,userId,oldName]);
        } else db.run('INSERT INTO categories (user_id,name,isEssential) VALUES (?,?,0)',[userId,name]);
      });
    }
    async saveSaving(userId,data,id=null) {
      if(!String(data.name).trim()||String(data.name).length>100)throw new Error('Informe o nome do objetivo.');
      validateAmount(data.target);validateAmount(data.saved,true);
      if(!F.validDate(data.targetDate))throw new Error('Informe a data do objetivo.');
      return this.change(db=>{
        if(id) db.run('UPDATE savings SET name=?,target=?,saved=?,targetDate=? WHERE user_id=? AND id=?',[data.name.trim(),Number(data.target),Number(data.saved),data.targetDate,userId,id]);
        else db.run('INSERT INTO savings (user_id,name,target,saved,targetDate) VALUES (?,?,?,?,?)',[userId,data.name.trim(),Number(data.target),Number(data.saved),data.targetDate]);
      });
    }
    export() { return this.db.export(); }
    inspectBackup(bytes) {
      if(bytes.byteLength>25*1024*1024)throw new Error('O arquivo ultrapassa o limite de 25 MB.');
      const candidate=new this.SQL.Database(bytes);
      try {
        if(query(candidate,'PRAGMA quick_check')[0]?.quick_check!=='ok')throw new Error('O banco está corrompido.');
        if(query(candidate,"SELECT name FROM sqlite_master WHERE type IN ('trigger','view')").length)throw new Error('O arquivo contém estruturas não permitidas.');
        for(const [table,columns] of Object.entries({users:['id','email','password'],transactions:['id','user_id','description','amount','date','type','category'],goals:['id','user_id','description','amount','dueDate','type','status'],categories:['id','user_id','name','isEssential'],settings:['id','user_id','spendingLimit','incomeGoal']})) {
          const existing=query(candidate,`PRAGMA table_info(${table})`).map(c=>c.name);
          if(!columns.every(c=>existing.includes(c)))throw new Error('Este arquivo não é um backup compatível do Gestor.');
        }
        const users=query(candidate,'SELECT * FROM users');
        if(!users.length)throw new Error('O backup não contém perfis.');
        for(const u of users)if(typeof u.email!=='string'||typeof u.password!=='string')throw new Error('Perfil inválido no backup.');
        const ids=new Set(users.map(u=>u.id));
        for(const table of ['transactions','goals']) for(const row of query(candidate,`SELECT * FROM ${table}`)) {
          validateEntry({...row,date:row.date||row.dueDate});
          if(!ids.has(row.user_id))throw new Error('O backup contém registros sem perfil.');
        }
        for(const setting of query(candidate,'SELECT * FROM settings')) {validateAmount(setting.spendingLimit,true);validateAmount(setting.incomeGoal,true);}
        migrate(candidate,this.today());
        for(const row of query(candidate,'SELECT * FROM monthly_budgets')) {validateAmount(row.spendingLimit,true);validateAmount(row.incomeGoal,true);}
        for(const row of query(candidate,'SELECT * FROM savings')) {validateAmount(row.target);validateAmount(row.saved,true);if(!F.validDate(row.targetDate))throw new Error('Objetivo com data inválida.');}
        return {users:users.length,transactions:query(candidate,"SELECT count(*) AS n FROM transactions WHERE status='completed' AND deletedAt IS NULL")[0].n,goals:query(candidate,"SELECT count(*) AS n FROM goals WHERE status='pending' AND deletedAt IS NULL")[0].n,bytes:candidate.export()};
      } finally {candidate.close();}
    }
    async restoreBackup(bytes) {
      const verified=this.inspectBackup(bytes);
      return this.lock(async()=>{
        if(this.storage.getItem('db')!==this.baseline)throw new Error('Os dados mudaram em outra janela. Recarregue antes de restaurar.');
        const replacement=new this.SQL.Database(verified.bytes);
        try {const serialized=encode(replacement);this.storage.setItem('db',serialized);this.db.close();this.db=replacement;this.baseline=serialized;}
        catch(error){replacement.close();throw error;}
      });
    }
  }
  const api={FinanceStore,validateAmount,validateEntry,migrate,query};
  if(typeof module!=='undefined')module.exports=api;else root.FinanceData=api;
})(globalThis);
