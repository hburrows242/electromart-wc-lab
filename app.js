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

  // ---- What-if levers ----

  const LEVERS = ['dio', 'dso', 'dpo'];

  function $(id) { return document.getElementById(id); }

  function setCell(id, text, negative) {
    const el = $(id);
    el.textContent = text;
    el.classList.toggle('neg', !!negative);
  }

  // Reads the three sliders and redraws every What-if figure.
  function renderWhatIf(s, a) {
    const v = {};
    LEVERS.forEach(function (k) {
      v[k] = Number($('s-' + k).value);
      $('o-' + k).textContent = C.fmtDays(v[k]) + ' days';
    });
    const w = C.whatIf(v.dio, v.dso, v.dpo, s.before, a);

    $('w-ccc').textContent = C.fmtDays(w.ccc) + ' days';

    const body = $('whatif-body');
    body.innerHTML = '';
    [
      ['Inventory', 'DIO × COGS / ' + a.days_in_year, 'inventory'],
      ['Receivables', 'DSO × Revenue / ' + a.days_in_year, 'receivables'],
      ['Payables', 'DPO × COGS / ' + a.days_in_year, 'payables'],
    ].forEach(function (l) {
      body.appendChild(row([
        { html: l[0] + '<span class="formula">' + l[1] + '</span>' },
        C.fmtDollars(w.balances[l[2]]),
        { html: C.fmtDollars(w.cashFreed[l[2]]), cls: Math.round(w.cashFreed[l[2]]) < 0 ? 'neg' : '' },
      ]));
    });
    body.appendChild(row([
      'Total cash freed', '',
      { html: C.fmtDollars(w.cashFreed.total), cls: Math.round(w.cashFreed.total) < 0 ? 'neg' : '' },
    ], 'total'));

    const line = s.before.notes_payable;
    $('w-interest-label').textContent = w.interestSaved < 0
      ? 'Extra interest per year on the bank line (shown as a negative saving)'
      : 'Interest saved per year if every freed dollar pays down the bank line';
    setCell('w-interest', C.fmtDollars(w.interestSaved), Math.round(w.interestSaved) < 0);
    $('w-interest-note').textContent =
      'Cash freed × ' + C.fmtPercent(a.bank_rate) + ', counting at most the ' + C.fmtDollars(line) +
      ' owed on the bank line Before. This assumes every freed dollar pays down the line. ' +
      'The case\'s own balance sheet shows part of the cash was kept.';

    $('w-late-label').textContent = 'Days paid past the net-' + a.net_days + ' due date (DPO − ' + a.net_days + ', never below 0)';
    $('w-late').textContent = C.fmtDays(w.daysPastDue) + ' days';

    const d = a.supplier_discount;
    $('w-cost-label').textContent = 'Nominal annual cost of skipping the ' + C.fmtPercent(d) + ' discount';
    $('w-dollars-label').textContent = 'Discount given up per year (' + C.fmtPercent(d) + ' × annual purchases)';
    if (w.takesDiscount) {
      $('w-cost').textContent = 'None: takes the discount';
      $('w-cost-note').textContent =
        'Paying within ' + a.discount_days + ' days earns the ' + C.fmtPercent(d) + ' discount, so nothing is given up.';
    } else {
      $('w-cost').textContent = C.fmtPercent(w.discountCost);
      $('w-cost-note').textContent =
        'Cost = ' + (d * 100) + ' / ' + ((1 - d) * 100) + ' × ' + a.days_in_year + ' / (DPO − ' + a.discount_days +
        '). This is a nominal annual rate (no compounding). Purchases equal COGS.';
    }
    $('w-dollars').textContent = C.fmtDollars(w.discountDollars);
  }

  function setupWhatIf(s, a) {
    const days = a.days_in_year;
    const presets = { before: C.cycle(s.before, days), after: C.cycle(s.after, days) };

    // Sliders run 0–120 days, or wider if this company's own days need it.
    LEVERS.forEach(function (k) {
      const el = $('s-' + k);
      el.max = String(Math.max(120, Math.ceil(presets.before[k]), Math.ceil(presets.after[k])));
      el.addEventListener('input', function () { renderWhatIf(s, a); });
    });

    // step="any" lets a slider hold the exact value, so these match the table above.
    function setTo(p) {
      LEVERS.forEach(function (k) { $('s-' + k).value = String(p[k]); });
      renderWhatIf(s, a);
    }
    $('set-before').addEventListener('click', function () { setTo(presets.before); });
    $('set-after').addEventListener('click', function () { setTo(presets.after); });

    setTo(presets.before);
    $('whatif-section').hidden = false;
  }

  function showError(msg) {
    const el = document.getElementById('status');
    el.textContent = msg;
    el.classList.add('error');
    el.hidden = false;
  }

  // Register the service worker (sw.js) so the app installs and works offline.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function (err) {
      console.warn('Service worker not registered:', err);
    });
  }

  Promise.all([fetchText('data/electromart.csv'), fetchText('data/assumptions.csv')])
    .then(function (texts) {
      const s = C.statementsFromRows(C.parseCSV(texts[0]));
      const assumptions = C.assumptionsFromRows(C.parseCSV(texts[1]));
      const problems = C.checkStatements(s).concat(C.checkAssumptions(assumptions));
      const days = assumptions.days_in_year;
      if (problems.length) { showError('The data has a problem: ' + problems.join('; ')); return; }

      renderCycle(s, days);
      renderCash(s, days);
      setupWhatIf(s, assumptions);
      document.getElementById('status').hidden = true;
      document.getElementById('cycle-section').hidden = false;
      document.getElementById('cash-section').hidden = false;
    })
    .catch(function (err) {
      showError(err.message + '. If you opened index.html straight from your computer, the browser blocks reading the CSV files. Use the published GitHub Pages address instead.');
    });
})();
