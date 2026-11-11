// app.js: loads the CSV files and puts the numbers on the page.
// All the finance math lives in ccc.js (the global CCC).
(function () {
  'use strict';

  const C = window.CCC;

  function fetchText(path) {
    return fetch(path, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('Could not load ' + path + ' (' + res.status + ')');
      return res.text();
    });
  }

  // Helper: build a table row from an array of cells.
  // Each cell is a string or { html, cls } (html is only ever our own formatted text).
  function row(cells, cls) {
    const tr = document.createElement('tr');
    if (cls) tr.className = cls;
    cells.forEach(function (c, i) {
      const td = document.createElement(i === 0 ? 'th' : 'td');
      if (i === 0) td.scope = 'row';
      if (typeof c === 'string') td.textContent = c;
      else { td.innerHTML = c.html; if (c.cls) td.className = c.cls; }
      tr.appendChild(td);
    });
    return tr;
  }

  function signedDays(x) {
    const s = C.fmtDays(Math.abs(x));
    if (Math.round(x * 100) === 0) return '0.00';
    return (x > 0 ? '+' : '−') + s;
  }

  function renderCycle(s, days) {
    const b = C.cycle(s.before, days);
    const a = C.cycle(s.after, days);
    const body = document.getElementById('cycle-body');
    body.innerHTML = '';

    const lines = [
      ['DIO', 'dio', 'Inventory / COGS × ' + days],
      ['DSO', 'dso', 'Receivables / Revenue × ' + days],
      ['DPO', 'dpo', 'Payables / COGS × ' + days],
    ];
    lines.forEach(function (l) {
      body.appendChild(row([
        { html: l[0] + '<span class="formula">' + l[2] + '</span>' },
        C.fmtDays(b[l[1]]),
        C.fmtDays(a[l[1]]),
        signedDays(a[l[1]] - b[l[1]]),
      ]));
    });
    body.appendChild(row([
      { html: 'CCC<span class="formula">DIO + DSO − DPO</span>' },
      C.fmtDays(b.ccc),
      C.fmtDays(a.ccc),
      signedDays(a.ccc - b.ccc),
    ], 'total'));

    document.getElementById('cycle-note').textContent =
      'Uses a ' + days + '-day year from data/assumptions.csv. Days are rounded only for display.';
  }

  function renderCash(s, days) {
    const f = C.cashFreed(s.before, s.after, days);
    const body = document.getElementById('cash-body');
    body.innerHTML = '';

    const levers = [
      ['Inventory', 'inventory', 'inventory', 'DIO', 'COGS'],
      ['Receivables', 'accounts_receivable', 'receivables', 'DSO', 'revenue'],
      ['Payables', 'accounts_payable', 'payables', 'DPO', 'COGS'],
    ];
    levers.forEach(function (l) {
      const check = 'Check from ' + l[3] + ' and ' + l[4] + ': ' + C.fmtDollars(f.fromDays[l[2]]);
      body.appendChild(row([
        { html: l[0] + '<span class="formula">' + check + '</span>' },
        C.fmtNumber(s.before[l[1]]),
        C.fmtNumber(s.after[l[1]]),
        { html: C.fmtDollars(f[l[2]]), cls: f[l[2]] < 0 ? 'neg' : '' },
      ]));
    });
    body.appendChild(row(['Total', '', '', { html: C.fmtDollars(f.total), cls: f.total < 0 ? 'neg' : '' }], 'total'));
  }

  function showError(msg) {
    const el = document.getElementById('status');
    el.textContent = msg;
    el.classList.add('error');
    el.hidden = false;
  }

  Promise.all([fetchText('data/electromart.csv'), fetchText('data/assumptions.csv')])
    .then(function (texts) {
      const s = C.statementsFromRows(C.parseCSV(texts[0]));
      const assumptions = C.assumptionsFromRows(C.parseCSV(texts[1]));
      const problems = C.checkStatements(s);
      const days = assumptions.days_in_year;
      if (!isFinite(days) || days <= 0) problems.push('days_in_year is missing from data/assumptions.csv');
      if (problems.length) { showError('The data has a problem: ' + problems.join('; ')); return; }

      renderCycle(s, days);
      renderCash(s, days);
      document.getElementById('status').hidden = true;
      document.getElementById('cycle-section').hidden = false;
      document.getElementById('cash-section').hidden = false;
    })
    .catch(function (err) {
      showError(err.message + '. If you opened index.html straight from your computer, the browser blocks reading the CSV files. Use the published GitHub Pages address instead.');
    });
})();
