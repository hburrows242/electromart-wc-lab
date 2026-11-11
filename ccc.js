// ccc.js: the finance math for the ElectroMart CCC app.
// These functions never touch the page, so they can be checked with Node:
//   node -e "const c = require('./ccc.js'); console.log(c.dio(1200000, 6000000, 365))"
// Nothing is rounded here. Rounding happens only when numbers are shown.

(function (root) {
  'use strict';

  // ---- Reading the CSV files ----

  // Turns CSV text into an array of objects keyed by the header row.
  // The lab's files are simple (no quoted commas), so a plain split is enough.
  function parseCSV(text) {
    const lines = text.replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() !== ''; });
    const headers = lines[0].split(',').map(function (h) { return h.trim(); });
    return lines.slice(1).map(function (line) {
      const cells = line.split(',');
      const row = {};
      headers.forEach(function (h, i) { row[h] = (cells[i] || '').trim(); });
      return row;
    });
  }

  // Builds { before: {item: number}, after: {item: number}, sections: {item: section} }
  // from the rows of a statements file like data/electromart.csv.
  function statementsFromRows(rows) {
    const out = { before: {}, after: {}, sections: {} };
    rows.forEach(function (r) {
      out.before[r.item] = Number(r.before);
      out.after[r.item] = Number(r.after);
      out.sections[r.item] = r.section;
    });
    return out;
  }

  // Builds { days_in_year: 365, bank_rate: 0.08, ... } from data/assumptions.csv.
  function assumptionsFromRows(rows) {
    const out = {};
    rows.forEach(function (r) { out[r.assumption] = Number(r.value); });
    return out;
  }

  // The line items the calculations need, with the section each must be in.
  const REQUIRED = {
    revenue: 'income_statement',
    cogs: 'income_statement',
    inventory: 'asset',
    accounts_receivable: 'asset',
    accounts_payable: 'liability_or_equity',
    notes_payable: 'liability_or_equity',
  };

  // The assumptions the calculations need from data/assumptions.csv.
  const REQUIRED_ASSUMPTIONS = ['days_in_year', 'bank_rate', 'supplier_discount', 'discount_days', 'net_days'];

  // Returns a list of problems with an assumptions object (empty if none).
  function checkAssumptions(a) {
    const problems = [];
    REQUIRED_ASSUMPTIONS.forEach(function (name) {
      if (!isFinite(a[name])) problems.push('Missing assumption: ' + name);
    });
    if (a.days_in_year <= 0) problems.push('days_in_year must be more than zero');
    return problems;
  }

  // Returns a list of problems with a statements object (empty if none).
  function checkStatements(s) {
    const problems = [];
    Object.keys(REQUIRED).forEach(function (item) {
      if (!(item in s.sections)) {
        problems.push('Missing line item: ' + item);
      } else if (s.sections[item] !== REQUIRED[item]) {
        problems.push(item + ' should be in section ' + REQUIRED[item] + ', not ' + s.sections[item]);
      } else if (!isFinite(s.before[item]) || !isFinite(s.after[item])) {
        problems.push(item + ' has a value that is not a number');
      }
    });
    ['revenue', 'cogs'].forEach(function (item) {
      if (s.before[item] === 0 || s.after[item] === 0) problems.push(item + ' cannot be zero');
    });
    return problems;
  }

  // ---- Day counts ----

  // Days inventory outstanding: how long goods sit before they are sold.
  function dio(inventory, cogs, daysInYear) { return inventory / cogs * daysInYear; }

  // Days sales outstanding: how long customers take to pay (all sales are on credit).
  function dso(receivables, revenue, daysInYear) { return receivables / revenue * daysInYear; }

  // Days payables outstanding: how long ElectroMart takes to pay suppliers (purchases = COGS).
  function dpo(payables, cogs, daysInYear) { return payables / cogs * daysInYear; }

  // Cash conversion cycle: days a dollar is tied up in operations.
  function ccc(dioDays, dsoDays, dpoDays) { return dioDays + dsoDays - dpoDays; }

  // All four measures for one period's statements.
  function cycle(period, daysInYear) {
    const d1 = dio(period.inventory, period.cogs, daysInYear);
    const d2 = dso(period.accounts_receivable, period.revenue, daysInYear);
    const d3 = dpo(period.accounts_payable, period.cogs, daysInYear);
    return { dio: d1, dso: d2, dpo: d3, ccc: ccc(d1, d2, d3) };
  }

  // ---- Cash freed ----

  // Cash freed by each lever, from the balance sheet change:
  //   a drop in an asset (inventory, receivables) frees cash;
  //   a rise in accounts payable frees cash.
  // Each lever also carries a cross-check from the day counts:
  //   days changed × annual COGS (or revenue) / days in year.
  // The two agree because revenue and COGS are the same in both periods.
  function cashFreed(before, after, daysInYear) {
    const b = cycle(before, daysInYear);
    const a = cycle(after, daysInYear);
    const inventory = before.inventory - after.inventory;
    const receivables = before.accounts_receivable - after.accounts_receivable;
    const payables = after.accounts_payable - before.accounts_payable;
    return {
      inventory: inventory,
      receivables: receivables,
      payables: payables,
      total: inventory + receivables + payables,
      fromDays: {
        inventory: (b.dio - a.dio) * before.cogs / daysInYear,
        receivables: (b.dso - a.dso) * before.revenue / daysInYear,
        payables: (a.dpo - b.dpo) * before.cogs / daysInYear,
      },
    };
  }

  // ---- What-if levers ----
  // Revenue and COGS are held at their Before values for every lever.

  // The balances a set of day counts implies: days × annual COGS (or revenue) / days in year.
  function impliedBalances(dioDays, dsoDays, dpoDays, before, daysInYear) {
    return {
      inventory: dioDays * before.cogs / daysInYear,
      receivables: dsoDays * before.revenue / daysInYear,
      payables: dpoDays * before.cogs / daysInYear,
    };
  }

  // Interest saved each year if every freed dollar pays down the bank line.
  // The line can't be paid below zero, so the saving is capped at its Before balance.
  // If cash freed is negative, ElectroMart borrows more and the "saving" is negative.
  function interestSaved(cashFreedTotal, bankLineBefore, bankRate) {
    return Math.min(cashFreedTotal, bankLineBefore) * bankRate;
  }

  // Days paid past the supplier's due date. Never less than zero.
  function daysPastDue(dpoDays, netDays) { return Math.max(0, dpoDays - netDays); }

  // Nominal annual cost of skipping the supplier discount:
  //   d / (1 − d) × days in year / (days paid − discount days)
  // Returns null if ElectroMart pays within the discount period (it takes the discount).
  function discountCost(discount, dpoDays, discountDays, daysInYear) {
    if (dpoDays <= discountDays) return null;
    return discount / (1 - discount) * daysInYear / (dpoDays - discountDays);
  }

  // Everything the What-if section shows for one set of slider values.
  function whatIf(dioDays, dsoDays, dpoDays, before, assumptions) {
    const days = assumptions.days_in_year;
    const bal = impliedBalances(dioDays, dsoDays, dpoDays, before, days);
    const freed = {
      inventory: before.inventory - bal.inventory,
      receivables: before.accounts_receivable - bal.receivables,
      payables: bal.payables - before.accounts_payable,
    };
    freed.total = freed.inventory + freed.receivables + freed.payables;
    const cost = discountCost(assumptions.supplier_discount, dpoDays, assumptions.discount_days, days);
    return {
      ccc: ccc(dioDays, dsoDays, dpoDays),
      balances: bal,
      cashFreed: freed,
      interestSaved: interestSaved(freed.total, before.notes_payable, assumptions.bank_rate),
      daysPastDue: daysPastDue(dpoDays, assumptions.net_days),
      takesDiscount: cost === null,
      discountCost: cost, // nominal annual rate, or null if the discount is taken
      // Dollars of discount given up in a year: the discount × annual purchases (= COGS).
      discountDollars: cost === null ? 0 : assumptions.supplier_discount * before.cogs,
    };
  }

  // ---- Formatting (for display only) ----

  function fmtDays(x) {
    return x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtDollars(x) {
    const r = Math.round(x);
    const s = Math.abs(r).toLocaleString('en-US', { maximumFractionDigits: 0 });
    return (r < 0 ? '−$' : '$') + s;
  }

  function fmtNumber(x) {
    return x.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function fmtPercent(x) {
    return (x * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
  }

  const api = {
    parseCSV: parseCSV,
    statementsFromRows: statementsFromRows,
    assumptionsFromRows: assumptionsFromRows,
    checkStatements: checkStatements,
    dio: dio,
    dso: dso,
    dpo: dpo,
    ccc: ccc,
    cycle: cycle,
    cashFreed: cashFreed,
    checkAssumptions: checkAssumptions,
    impliedBalances: impliedBalances,
    interestSaved: interestSaved,
    daysPastDue: daysPastDue,
    discountCost: discountCost,
    whatIf: whatIf,
    fmtDays: fmtDays,
    fmtDollars: fmtDollars,
    fmtNumber: fmtNumber,
    fmtPercent: fmtPercent,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api; // Node
  } else {
    root.CCC = api; // browser
  }
})(this);
