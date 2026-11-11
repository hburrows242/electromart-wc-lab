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
  };

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
