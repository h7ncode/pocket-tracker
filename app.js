/* ============================================================
   Pocket Money Tracker - app logic (vanilla JS, no libraries)
   All data lives in localStorage under one key.
   Totals are never stored; they are always calculated from the
   incomes and expenses arrays, so they can never go stale.
   ============================================================ */
'use strict';

/* ---------- Constants ---------- */
const STORAGE_KEY = 'pocketTracker_v1'; // the single localStorage key
const CURRENCY = 'Rs';                  // currency label used everywhere
const IMPULSIVE_THRESHOLD = 50;         // letter shows when impulsive total > this

/* ---------- In-memory copy of the saved data ---------- */
// Shape:
// {
//   profile: { name, frequency, allowanceAmount, createdAt },
//   goal: { title },
//   futureLetter: "text",
//   incomes:  [ { id, amount, date, note } ],
//   expenses: [ { id, amount, description, date, impulsive } ],
//   settings: { impulsiveThreshold, currency }
// }
let data = null;


/* ============================================================
   STORAGE
   ============================================================ */

/**
 * Reads the saved data from localStorage.
 * Parameters: none.
 * Returns: the parsed data object, or null if nothing is saved
 * (or the saved text is corrupted).
 * Touches: reads localStorage only. Does not touch the DOM.
 */
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY); // read the JSON string
    if (!raw) return null;                         // first visit: nothing saved
    return JSON.parse(raw);                        // turn the string back into an object
  } catch (err) {
    return null;                                   // corrupted data: treat as first visit
  }
}

/**
 * Writes the current in-memory `data` object to localStorage.
 * Parameters: none (uses the global `data`).
 * Touches: writes localStorage. Does not touch the DOM.
 */
function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

/**
 * Builds a fresh, empty data object for a new user.
 * Parameters: none.
 * Returns: a new data object with empty lists and default settings.
 * Touches: nothing (the caller saves it).
 */
function createEmptyData() {
  return {
    profile: { name: '', frequency: 'monthly', allowanceAmount: 0, createdAt: todayISO() },
    goal: { title: '' },
    futureLetter: '',
    incomes: [],
    expenses: [],
    settings: { impulsiveThreshold: IMPULSIVE_THRESHOLD, currency: CURRENCY }
  };
}


/* ============================================================
   SMALL HELPERS
   ============================================================ */

/**
 * Creates a DOM element with safe text (textContent, never innerHTML),
 * so anything the student types can't inject HTML.
 * Parameters: tag (string), text (string, optional), className (string, optional).
 * Returns: the new element (not yet added to the page).
 */
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

/**
 * Gets today's date in the user's LOCAL time as "YYYY-MM-DD".
 * (toISOString would use UTC and can show the wrong day.)
 * Parameters: none. Returns: string.
 */
function todayISO() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

/**
 * Gets the current month as "YYYY-MM".
 * Parameters: none. Returns: string.
 */
function currentMonthKey() {
  return todayISO().slice(0, 7);
}

/**
 * Makes a reasonably unique id for an income or expense.
 * Parameters: prefix (string, e.g. "e" or "i"). Returns: string.
 */
function generateId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

/**
 * Formats a number as money, e.g. "Rs 1,250".
 * Parameters: n (number). Returns: string.
 */
function formatMoney(n) {
  return CURRENCY + ' ' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/**
 * Turns "2026-11" into "November 2026".
 * Parameters: monthKey (string "YYYY-MM"). Returns: string.
 */
function monthLabel(monthKey) {
  const parts = monthKey.split('-');
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Turns "monthly" / "weekly" / "daily" into a display label.
 * Parameters: freq (string). Returns: string.
 */
function frequencyLabel(freq) {
  const labels = { monthly: 'Monthly', weekly: 'Weekly', daily: 'Daily' };
  return labels[freq] || 'Monthly';
}

/**
 * Checks whether an income/expense belongs to a given month.
 * Parameters: item (object with a `date` "YYYY-MM-DD"), monthKey (string "YYYY-MM").
 * Returns: true or false.
 */
function inMonth(item, monthKey) {
  return item.date.slice(0, 7) === monthKey;
}

/**
 * Returns the first and last allowed date of the current month,
 * used as min/max on the date inputs.
 * Parameters: none. Returns: { first, last } as "YYYY-MM-DD" strings.
 */
function currentMonthBounds() {
  const key = currentMonthKey();
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const lastDay = new Date(year, month, 0).getDate(); // day 0 of next month = last day of this one
  return { first: key + '-01', last: key + '-' + String(lastDay).padStart(2, '0') };
}

/**
 * Shows an error message under a form, or hides it if message is empty.
 * Parameters: id (string, element id of the error paragraph), message (string).
 * Updates the DOM only.
 */
function showError(id, message) {
  const box = document.getElementById(id);
  box.textContent = message || '';
  box.hidden = !message;
}


/* ============================================================
   CALCULATIONS
   ============================================================ */

/**
 * Calculates all totals for one month from the saved lists.
 * Parameters: monthKey (string "YYYY-MM").
 * Returns: { pocketMoney, expenses, impulsive, balance }.
 * Touches: nothing (pure calculation, reads global `data`).
 */
function calcTotals(monthKey) {
  let pocketMoney = 0;
  let expenses = 0;
  let impulsive = 0;

  data.incomes.forEach(function (inc) {
    if (inMonth(inc, monthKey)) pocketMoney += inc.amount;
  });

  data.expenses.forEach(function (exp) {
    if (!inMonth(exp, monthKey)) return;
    expenses += exp.amount;
    if (exp.impulsive) impulsive += exp.amount; // impulsive is a subset of expenses
  });

  return { pocketMoney: pocketMoney, expenses: expenses, impulsive: impulsive, balance: pocketMoney - expenses };
}


/* ============================================================
   SCREENS AND MODALS
   ============================================================ */

/**
 * Shows either the onboarding screen or the dashboard.
 * Parameters: screen (string: "onboarding" or "dashboard").
 * Updates the DOM only (toggles the `hidden` attribute).
 */
function showScreen(screen) {
  document.getElementById('onboarding').hidden = (screen !== 'onboarding');
  document.getElementById('dashboard').hidden = (screen !== 'dashboard');
}

/**
 * Opens a modal.
 * Parameters: id (string, element id of the modal).
 * Updates the DOM only.
 */
function openModal(id) {
  document.getElementById(id).hidden = false;
}

/**
 * Closes a modal.
 * Parameters: id (string, element id of the modal).
 * Updates the DOM only.
 */
function closeModal(id) {
  document.getElementById(id).hidden = true;
}


/* ============================================================
   RENDERING
   ============================================================ */

/**
 * Redraws the whole dashboard for the current month:
 * greeting, goal, totals, forms' date limits, both lists and the red theme.
 * Parameters: none (reads global `data`).
 * Updates the DOM only. Does not write localStorage.
 */
function renderDashboard() {
  const monthKey = currentMonthKey();
  const totals = calcTotals(monthKey);

  // Header text
  document.getElementById('greeting').textContent =
    'Hi ' + data.profile.name + ' - ' + frequencyLabel(data.profile.frequency) + ' allowance of ' +
    formatMoney(data.profile.allowanceAmount);

  // Summary numbers
  document.getElementById('monthTitle').textContent = monthLabel(monthKey) + ' Summary';
  document.getElementById('sumPocket').textContent = formatMoney(totals.pocketMoney);
  document.getElementById('sumExpenses').textContent = formatMoney(totals.expenses);
  document.getElementById('sumImpulsive').textContent = formatMoney(totals.impulsive);

  const balanceEl = document.getElementById('sumBalance');
  balanceEl.textContent = formatMoney(totals.balance);
  balanceEl.classList.toggle('negative', totals.balance < 0);

  // Add-pocket-money hint
  document.getElementById('allowanceHint').textContent =
    'Your ' + frequencyLabel(data.profile.frequency).toLowerCase() + ' allowance is ' +
    formatMoney(data.profile.allowanceAmount) + '. You can add it again or any other amount.';

  // Limit date pickers to the current month (the dashboard only shows this month)
  const bounds = currentMonthBounds();
  ['incDate', 'expDate'].forEach(function (id) {
    const input = document.getElementById(id);
    input.min = bounds.first;
    input.max = bounds.last;
    if (!input.value) input.value = todayISO();
  });

  // Pre-fill the income amount with the regular allowance if empty
  const incAmount = document.getElementById('incAmount');
  if (!incAmount.value) incAmount.value = data.profile.allowanceAmount;

  updateGoalBar(totals);
  renderExpenses(monthKey);
  renderIncomes(monthKey);
  applyDangerTheme(totals.balance);
}

/**
 * Updates the goal title and the progress bar.
 * The bar shows (remaining balance / total pocket money), so it
 * starts full and shrinks every time money is spent.
 * Parameters: totals (object from calcTotals).
 * Updates the DOM only.
 */
function updateGoalBar(totals) {
  document.getElementById('goalTitle').textContent = data.goal.title;

  // Percentage left, clamped between 0 and 100
  let percent = 0;
  if (totals.pocketMoney > 0) {
    percent = (totals.balance / totals.pocketMoney) * 100;
  }
  percent = Math.max(0, Math.min(100, percent));
  const rounded = Math.round(percent);

  // Width and colour (green > amber below 50% > red below 20%)
  const fill = document.getElementById('progressFill');
  fill.style.width = percent + '%';
  fill.classList.toggle('warn', percent < 50 && percent >= 20);
  fill.classList.toggle('low', percent < 20);

  document.getElementById('progressTrack').setAttribute('aria-valuenow', String(rounded));

  // Label under the bar
  const label = document.getElementById('progressLabel');
  if (totals.pocketMoney === 0) {
    label.textContent = 'Add pocket money to start tracking.';
  } else if (totals.balance < 0) {
    label.textContent = '0% left. You have spent more than you have.';
  } else {
    label.textContent = rounded + '% of this month\'s pocket money is still saved.';
  }
}

/**
 * Draws this month's expenses, newest first, each with a Delete button.
 * Parameters: monthKey (string "YYYY-MM").
 * Updates the DOM only.
 */
function renderExpenses(monthKey) {
  const list = document.getElementById('expenseList');
  list.replaceChildren(); // clear old rows

  const items = data.expenses
    .filter(function (e) { return inMonth(e, monthKey); })
    .sort(function (a, b) { return b.date.localeCompare(a.date); });

  if (items.length === 0) {
    list.appendChild(el('li', 'No expenses yet this month.', 'empty'));
    return;
  }

  items.forEach(function (exp) {
    const li = el('li', '', 'row');

    // Left side: description, date, optional "Impulsive" tag
    const info = el('div', '', 'row-info');
    info.appendChild(el('strong', exp.description));
    info.appendChild(el('span', exp.date, 'meta'));
    if (exp.impulsive) info.appendChild(el('span', 'Impulsive', 'tag'));

    // Right side: amount and delete button
    const actions = el('div', '', 'row-actions');
    actions.appendChild(el('span', formatMoney(exp.amount), 'amount'));
    const del = el('button', 'Delete', 'btn-small');
    del.type = 'button';
    del.addEventListener('click', function () { deleteExpense(exp.id); });
    actions.appendChild(del);

    li.appendChild(info);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

/**
 * Draws this month's pocket money entries, newest first, each with a Delete button.
 * Parameters: monthKey (string "YYYY-MM").
 * Updates the DOM only.
 */
function renderIncomes(monthKey) {
  const list = document.getElementById('incomeList');
  list.replaceChildren();

  const items = data.incomes
    .filter(function (i) { return inMonth(i, monthKey); })
    .sort(function (a, b) { return b.date.localeCompare(a.date); });

  if (items.length === 0) {
    list.appendChild(el('li', 'No pocket money added this month.', 'empty'));
    return;
  }

  items.forEach(function (inc) {
    const li = el('li', '', 'row');

    const info = el('div', '', 'row-info');
    info.appendChild(el('strong', inc.note || 'Pocket money'));
    info.appendChild(el('span', inc.date, 'meta'));

    const actions = el('div', '', 'row-actions');
    actions.appendChild(el('span', formatMoney(inc.amount), 'amount'));
    const del = el('button', 'Delete', 'btn-small');
    del.type = 'button';
    del.addEventListener('click', function () { deleteIncome(inc.id); });
    actions.appendChild(del);

    li.appendChild(info);
    li.appendChild(actions);
    list.appendChild(li);
  });
}

/**
 * Turns the whole screen red (and shows a warning banner) when the
 * balance is below zero; restores the normal look otherwise.
 * Parameters: balance (number).
 * Updates the DOM only (body class + banner).
 */
function applyDangerTheme(balance) {
  const banner = document.getElementById('dangerBanner');
  const isNegative = balance < 0;

  document.body.classList.toggle('danger', isNegative);
  banner.hidden = !isNegative;
  if (isNegative) {
    banner.textContent = 'WARNING: You are over budget by ' + formatMoney(Math.abs(balance)) + '. Stop spending!';
  }
}


/* ============================================================
   ACTIONS: expenses and pocket money
   ============================================================ */

/**
 * Handles the Add Expense form: validates, saves, redraws, then
 * checks whether the Letter to Future Self should appear.
 * Parameters: event (submit event).
 * Updates: data.expenses in localStorage, and the DOM.
 */
function addExpense(event) {
  event.preventDefault();

  const amount = parseFloat(document.getElementById('expAmount').value);
  const description = document.getElementById('expDesc').value.trim();
  const date = document.getElementById('expDate').value;
  const impulsive = document.getElementById('expImpulsive').checked;

  // Validation
  if (!(amount > 0)) { showError('expError', 'Enter an amount greater than 0.'); return; }
  if (!description) { showError('expError', 'Enter a description or category.'); return; }
  if (!date || !inMonth({ date: date }, currentMonthKey())) {
    showError('expError', 'Pick a date in the current month.');
    return;
  }
  showError('expError', '');

  // Save the new expense
  const expense = { id: generateId('e'), amount: amount, description: description, date: date, impulsive: impulsive };
  data.expenses.push(expense);
  saveData();

  // Reset the form (keep today's date ready)
  document.getElementById('expenseForm').reset();
  document.getElementById('expDate').value = todayISO();

  renderDashboard();
  checkImpulsiveTrigger(expense); // psychology trigger runs AFTER saving
}

/**
 * Deletes one expense after confirmation.
 * Never triggers the letter popup.
 * Parameters: id (string, the expense id).
 * Updates: data.expenses in localStorage, and the DOM.
 */
function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  data.expenses = data.expenses.filter(function (e) { return e.id !== id; });
  saveData();
  renderDashboard();
}

/**
 * Handles the Add Pocket Money form: validates and saves one entry.
 * Several entries per month are allowed (e.g. weekly top-ups).
 * Parameters: event (submit event).
 * Updates: data.incomes in localStorage, and the DOM.
 */
function addIncome(event) {
  event.preventDefault();

  const amount = parseFloat(document.getElementById('incAmount').value);
  const date = document.getElementById('incDate').value;
  const note = document.getElementById('incNote').value.trim();

  if (!(amount > 0)) { showError('incError', 'Enter an amount greater than 0.'); return; }
  if (!date || !inMonth({ date: date }, currentMonthKey())) {
    showError('incError', 'Pick a date in the current month.');
    return;
  }
  showError('incError', '');

  data.incomes.push({
    id: generateId('i'),
    amount: amount,
    date: date,
    note: note || (frequencyLabel(data.profile.frequency) + ' allowance')
  });
  saveData();

  // Reset form, then put the default amount and date back
  document.getElementById('incomeForm').reset();
  document.getElementById('incDate').value = todayISO();
  document.getElementById('incAmount').value = data.profile.allowanceAmount;

  renderDashboard();
}

/**
 * Deletes one pocket money entry after confirmation.
 * Parameters: id (string, the income id).
 * Updates: data.incomes in localStorage, and the DOM.
 */
function deleteIncome(id) {
  if (!confirm('Delete this pocket money entry?')) return;
  data.incomes = data.incomes.filter(function (i) { return i.id !== id; });
  saveData();
  renderDashboard();
}


/* ============================================================
   PSYCHOLOGY FEATURE: LETTER TO FUTURE SELF
   ============================================================ */

/**
 * Decides whether to show the Letter to Future Self.
 * Rule: the expense just added must be impulsive AND this month's
 * cumulative impulsive total must be above the threshold (50).
 * It shows again on every such expense (by design).
 * Parameters: expense (the expense object that was just saved).
 * Updates the DOM only (opens the letter modal). Reads localStorage data.
 */
function checkImpulsiveTrigger(expense) {
  if (!expense.impulsive) return; // normal expenses never trigger the letter

  const totals = calcTotals(currentMonthKey());
  const letter = (data.futureLetter || '').trim();

  if (totals.impulsive > data.settings.impulsiveThreshold && letter) {
    document.getElementById('letterContext').textContent =
      'You have spent ' + formatMoney(totals.impulsive) + ' on impulsive things this month. ' +
      'You wrote this to yourself:';
    document.getElementById('letterText').textContent = letter; // textContent keeps it safe
    openModal('letterModal');
  }
}


/* ============================================================
   ONBOARDING AND PROFILE
   ============================================================ */

/**
 * Handles the first-time setup form: validates, creates the data
 * object, records the first allowance as a pocket money entry,
 * saves everything and opens the dashboard.
 * Parameters: event (submit event).
 * Updates: creates the whole data object in localStorage, and the DOM.
 */
function completeOnboarding(event) {
  event.preventDefault();

  const name = document.getElementById('obName').value.trim();
  const frequency = document.querySelector('input[name="obFrequency"]:checked').value;
  const amount = parseFloat(document.getElementById('obAmount').value);
  const goal = document.getElementById('obGoal').value.trim();
  const letter = document.getElementById('obLetter').value.trim();

  if (!name) { showError('obError', 'Please enter your name.'); return; }
  if (!(amount > 0)) { showError('obError', 'Enter an allowance amount greater than 0.'); return; }
  if (!goal) { showError('obError', 'Tell us what you are saving for.'); return; }
  showError('obError', '');

  // Build and fill the data object
  data = createEmptyData();
  data.profile.name = name;
  data.profile.frequency = frequency;
  data.profile.allowanceAmount = amount;
  data.goal.title = goal;
  data.futureLetter = letter;

  // The first allowance counts as the first pocket money entry
  data.incomes.push({
    id: generateId('i'),
    amount: amount,
    date: todayISO(),
    note: frequencyLabel(frequency) + ' allowance'
  });

  saveData();
  showScreen('dashboard');
  renderDashboard();
}

/**
 * Opens the Edit Profile modal with the saved values filled in.
 * Parameters: none.
 * Updates the DOM only.
 */
function openProfileModal() {
  document.getElementById('pfName').value = data.profile.name;
  document.getElementById('pfAmount').value = data.profile.allowanceAmount;
  document.getElementById('pfGoal').value = data.goal.title;
  document.getElementById('pfLetter').value = data.futureLetter;
  document.querySelector('input[name="pfFrequency"][value="' + data.profile.frequency + '"]').checked = true;
  showError('pfError', '');
  openModal('profileModal');
}

/**
 * Saves changes from the Edit Profile modal.
 * Parameters: event (submit event).
 * Updates: profile, goal and futureLetter in localStorage, and the DOM.
 */
function saveProfile(event) {
  event.preventDefault();

  const name = document.getElementById('pfName').value.trim();
  const frequency = document.querySelector('input[name="pfFrequency"]:checked').value;
  const amount = parseFloat(document.getElementById('pfAmount').value);
  const goal = document.getElementById('pfGoal').value.trim();
  const letter = document.getElementById('pfLetter').value.trim();

  if (!name) { showError('pfError', 'Please enter your name.'); return; }
  if (!(amount > 0)) { showError('pfError', 'Enter an allowance amount greater than 0.'); return; }
  if (!goal) { showError('pfError', 'Please enter a goal.'); return; }

  data.profile.name = name;
  data.profile.frequency = frequency;
  data.profile.allowanceAmount = amount;
  data.goal.title = goal;
  data.futureLetter = letter;
  saveData();

  // Refresh the suggested amount in the Add Pocket Money form
  document.getElementById('incAmount').value = amount;

  closeModal('profileModal');
  renderDashboard();
}

/**
 * Erases ALL saved data after confirmation and returns to onboarding.
 * Parameters: none.
 * Updates: removes the localStorage key, resets the form, and the DOM.
 */
function resetAllData() {
  if (!confirm('This erases your profile, expenses and letter. Continue?')) return;
  localStorage.removeItem(STORAGE_KEY);
  data = null;
  document.body.classList.remove('danger');
  document.getElementById('onboardingForm').reset();
  ['incAmount', 'incDate', 'expDate'].forEach(function (id) { document.getElementById(id).value = ''; });
  closeModal('profileModal');
  showScreen('onboarding');
}


/* ============================================================
   MONTHLY REPORT (PRINT TO PDF)
   ============================================================ */

/**
 * Builds an HTML table from headers and rows (safe text only).
 * Parameters: headers (array of strings), rows (array of arrays of strings),
 * numCols (array of column indexes to right-align).
 * Returns: a <table> element (not yet added to the page).
 */
function buildTable(headers, rows, numCols) {
  const table = el('table');
  const thead = el('thead');
  const headRow = el('tr');
  headers.forEach(function (h, i) {
    headRow.appendChild(el('th', h, numCols.indexOf(i) !== -1 ? 'num' : ''));
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  rows.forEach(function (row) {
    const tr = el('tr');
    row.forEach(function (cell, i) {
      tr.appendChild(el('td', cell, numCols.indexOf(i) !== -1 ? 'num' : ''));
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  return table;
}

/**
 * Fills the hidden #printReport section for the chosen month:
 * student, month, allowance cycle, totals, itemized expenses,
 * impulsive total and final balance.
 * Parameters: monthKey (string "YYYY-MM").
 * Updates the DOM only (the print CSS shows only this section).
 */
function buildReport(monthKey) {
  const root = document.getElementById('printReport');
  root.replaceChildren();
  const totals = calcTotals(monthKey);

  root.appendChild(el('h1', 'Monthly Expense Report'));

  // Basic details
  root.appendChild(buildTable(['Detail', 'Value'], [
    ['Student', data.profile.name],
    ['Month', monthLabel(monthKey)],
    ['Allowance cycle', frequencyLabel(data.profile.frequency)],
    ['Saving goal', data.goal.title],
    ['Report generated on', todayISO()]
  ], []));

  // Summary
  root.appendChild(el('h2', 'Summary'));
  root.appendChild(buildTable(['Item', 'Amount'], [
    ['Total pocket money', formatMoney(totals.pocketMoney)],
    ['Total expenses', formatMoney(totals.expenses)],
    ['Total impulsive / non-essential spending', formatMoney(totals.impulsive)],
    ['Final balance', formatMoney(totals.balance)]
  ], [1]));

  // Itemized expenses (oldest first for a readable statement)
  root.appendChild(el('h2', 'Itemized Expenses'));
  const expenseRows = data.expenses
    .filter(function (e) { return inMonth(e, monthKey); })
    .sort(function (a, b) { return a.date.localeCompare(b.date); })
    .map(function (e) {
      return [e.date, e.description, e.impulsive ? 'Yes' : 'No', formatMoney(e.amount)];
    });

  if (expenseRows.length === 0) {
    root.appendChild(el('p', 'No expenses recorded for this month.'));
  } else {
    root.appendChild(buildTable(['Date', 'Description', 'Impulsive', 'Amount'], expenseRows, [3]));
  }

  // Pocket money entries
  root.appendChild(el('h2', 'Pocket Money Received'));
  const incomeRows = data.incomes
    .filter(function (i) { return inMonth(i, monthKey); })
    .sort(function (a, b) { return a.date.localeCompare(b.date); })
    .map(function (i) { return [i.date, i.note || 'Pocket money', formatMoney(i.amount)]; });

  if (incomeRows.length === 0) {
    root.appendChild(el('p', 'No pocket money recorded for this month.'));
  } else {
    root.appendChild(buildTable(['Date', 'Note', 'Amount'], incomeRows, [2]));
  }

  root.appendChild(el('p', 'Generated by Pocket Money Tracker.', 'report-note'));
}

/**
 * Handles the "Download Monthly Report" button: builds the report
 * for the month picked in the month input, then opens the browser's
 * print dialog (choose "Save as PDF").
 * Parameters: none.
 * Updates the DOM (fills #printReport). Reads localStorage data only.
 */
function downloadReport() {
  // Fall back to the current month if the picker is empty
  const monthKey = document.getElementById('reportMonth').value || currentMonthKey();
  buildReport(monthKey);
  window.print();
}


/* ============================================================
   START-UP
   ============================================================ */

/**
 * Connects every button and form to its function.
 * Parameters: none.
 * Updates the DOM only (adds event listeners).
 */
function wireEvents() {
  document.getElementById('onboardingForm').addEventListener('submit', completeOnboarding);
  document.getElementById('incomeForm').addEventListener('submit', addIncome);
  document.getElementById('expenseForm').addEventListener('submit', addExpense);
  document.getElementById('profileForm').addEventListener('submit', saveProfile);

  document.getElementById('editProfileBtn').addEventListener('click', openProfileModal);
  document.getElementById('profileCancelBtn').addEventListener('click', function () { closeModal('profileModal'); });
  document.getElementById('resetBtn').addEventListener('click', resetAllData);
  document.getElementById('letterCloseBtn').addEventListener('click', function () { closeModal('letterModal'); });
  document.getElementById('downloadReportBtn').addEventListener('click', downloadReport);

  // Escape closes any open modal
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeModal('letterModal');
      closeModal('profileModal');
    }
  });
}

/**
 * App entry point: loads saved data and shows the right screen.
 * Parameters: none.
 * Reads localStorage; updates the DOM.
 */
function init() {
  wireEvents();

  // Default the report month picker to the current month
  document.getElementById('reportMonth').value = currentMonthKey();

  data = loadData();
  if (data && data.profile && data.profile.name) {
    showScreen('dashboard');   // returning user
    renderDashboard();
  } else {
    data = null;
    showScreen('onboarding');  // first visit
  }
}

init(); 