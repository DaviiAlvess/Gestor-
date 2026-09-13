(function (root) {
  'use strict';
  const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  const iso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  function addMonths(value, count) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1 + count, 1);
    date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
    return iso(date);
  }
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00`);
    return Number.isFinite(date.getTime()) && iso(date) === value;
  }
  function installments(amount, count, date) {
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999 || !Number.isInteger(count) || count < 1 || count > 360 || !validDate(date)) throw new Error('Confira o valor, a data e a quantidade de parcelas.');
    const cents = Math.round(amount * 100);
    if (cents < count) throw new Error('Cada parcela precisa ter pelo menos R$ 0,01.');
    return Array.from({ length: count }, (_, i) => ({ amount: (Math.floor(cents / count) + (i < cents % count ? 1 : 0)) / 100, date: addMonths(date, i) }));
  }
  function debt(amount, rate, payment) {
    if (![amount, rate, payment].every(Number.isFinite) || amount <= 0 || rate < 0 || payment <= 0) throw new Error('Informe valores positivos e uma taxa de juros válida.');
    if(amount > 999999999 || payment > 999999999 || Math.round(payment*100)<1) throw new Error('Informe valores monetários de até R$ 999.999.999,00.');
    if (payment <= amount * rate / 100) throw new Error('A parcela precisa ser maior que os juros do primeiro mês.');
    let remaining = Math.round(amount * 100), total = 0, interestTotal = 0;
    const schedule = [];
    while (remaining > 0 && schedule.length < 360) {
      const interest = Math.round(remaining * rate / 100);
      const paid = Math.min(Math.round(payment * 100), remaining + interest);
      if (paid <= interest) throw new Error('A parcela não cobre os juros após o arredondamento em centavos.');
      remaining = remaining + interest - paid;
      total += paid; interestTotal += interest;
      schedule.push({ amount: paid / 100, remaining: remaining / 100 });
    }
    if (remaining > 0) throw new Error('O prazo ultrapassa 360 meses. Aumente o valor da parcela.');
    return { schedule, total: total / 100, interest: interestTotal / 100 };
  }
  function income(amount, growth, months) {
    if (![amount, growth, months].every(Number.isFinite) || amount <= 0 || growth < -100 || !Number.isInteger(months) || months < 1 || months > 120) throw new Error('Informe um valor positivo, crescimento a partir de -100% e prazo de 1 a 120 meses.');
    const values = Array.from({ length: months }, (_, i) => amount * (1 + growth / 100) ** i);
    const total = values.reduce((a, b) => a + b, 0);
    if (!Number.isFinite(total) || total>Number.MAX_SAFE_INTEGER/100) throw new Error('Os valores excedem o limite da simulação.');
    return { total, last: values.at(-1), average: total / months };
  }
  const api = { money, iso, addMonths, validDate, installments, debt, income };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Finance = api;
})(globalThis);
