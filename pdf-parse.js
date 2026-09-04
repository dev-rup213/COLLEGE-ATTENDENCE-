/* ============================================================
   dashboard.js — Attendance Dashboard page
   ============================================================ */

(function () {
  const body = document.getElementById("dashboardBody");
  const routines = Storage.getRoutines();

  if (routines.length === 0) {
    App.guardNoRoutine(null, body);
    return;
  }

  const today = Utils.todayISO();
  const earliest = Attendance.earliestRoutineDate();
  const settings = Storage.getSettings();
  const target = settings.target ?? 75;

  const overall = Attendance.overallStats(today) || { present: 0, absent: 0, holiday: 0, total: 0, scheduled: 0, percentage: null };

  // remaining classes: from tomorrow through the active routine's end
  // date if set, otherwise through the end of the current month
  const activeRoutine = routines.find((r) => r.active) || Storage.getRoutineForDate(today);
  let remainingEnd;
  if (activeRoutine && activeRoutine.endDate) {
    remainingEnd = activeRoutine.endDate;
  } else {
    const d = Utils.fromISO(today);
    remainingEnd = Utils.toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }
  const tomorrow = Utils.addDays(today, 1);
  const remainingCount = remainingEnd >= tomorrow
    ? Attendance.enumerate(tomorrow, remainingEnd).length
    : 0;

  const needed = Utils.classesNeededForTarget(overall.present, overall.total, target);
  const canMiss = Utils.classesCanMissForTarget(overall.present, overall.total, target);
  const pct = overall.percentage;

  body.innerHTML = `
    <div class="sheet">
      <div class="card-row">
        <div class="stat-card"><div class="label">Overall Attendance</div><div class="value">${Utils.formatPct(pct)}</div></div>
        <div class="stat-card"><div class="label">Total Classes</div><div class="value">${overall.total}</div></div>
        <div class="stat-card"><div class="label">Attended</div><div class="value present">${overall.present}</div></div>
        <div class="stat-card"><div class="label">Absent</div><div class="value absent">${overall.absent}</div></div>
        <div class="stat-card"><div class="label">Not Held</div><div class="value holiday">${overall.holiday}</div></div>
        <div class="stat-card"><div class="label">Remaining (scheduled)</div><div class="value">${remainingCount}</div></div>
      </div>
    </div>

    <div class="sheet sheet-ruled">
      <div class="flex-between">
        <h2>Target Attendance</h2>
        <a class="btn btn-sm" href="settings.html">Change target</a>
      </div>
      <p>Current attendance: <strong>${Utils.formatPct(pct)}</strong> · Target: <strong>${target}%</strong></p>
      ${pct === null ? `<p class="muted">No attendance recorded yet.</p>` :
        pct >= target
          ? `<p>You are above target. You can miss up to <strong>${canMiss ?? 0}</strong> more class${canMiss === 1 ? "" : "es"} and stay at or above ${target}%.</p>`
          : `<p>You are below target. Attend the next <strong>${needed ?? "—"}</strong> class${needed === 1 ? "" : "es"} in a row to reach ${target}%.</p>`
      }
    </div>

    <div class="sheet sheet-ruled">
      <div class="flex-between">
        <h2>Day-wise</h2>
        <div class="field-row" style="min-width: 20rem;">
          <div class="field"><label for="dwFrom">From</label><input type="date" id="dwFrom"></div>
          <div class="field"><label for="dwTo">To</label><input type="date" id="dwTo"></div>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table class="data-table" id="dayWiseTable">
          <thead><tr><th>Date</th><th>Classes</th><th>Present</th><th>Absent</th><th>Not held</th><th>Attendance</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>

    <div class="sheet sheet-ruled">
      <div class="flex-between">
        <h2>Month-wise</h2>
        <select id="monthSelect"></select>
      </div>
      <div id="monthStats" class="card-row" style="margin-bottom: 0.9rem;"></div>
      <div id="monthChart"></div>
    </div>
  `;

  // ---- Day-wise ----
  const dwFrom = document.getElementById("dwFrom");
  const dwTo = document.getElementById("dwTo");
  dwFrom.value = Utils.addDays(today, -13);
  dwTo.value = today;

  function renderDayWise() {
    const rows = Attendance.dayWise(dwFrom.value, dwTo.value).sort((a, b) => (a.date < b.date ? 1 : -1));
    const tbody = document.querySelector("#dayWiseTable tbody");
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">No scheduled classes in this range.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((r) => `
      <tr class="clickable" data-date="${r.date}">
        <td>${Utils.shortDisplayDate(r.date)}</td>
        <td>${r.scheduled}</td>
        <td>${r.present}</td>
        <td>${r.absent}</td>
        <td>${r.holiday}</td>
        <td>${Utils.formatPct(r.percentage)}</td>
      </tr>`).join("");
    tbody.querySelectorAll("tr[data-date]").forEach((tr) => {
      tr.addEventListener("click", () => {
        window.location.href = `index.html?date=${tr.getAttribute("data-date")}`;
      });
    });
  }
  dwFrom.addEventListener("change", renderDayWise);
  dwTo.addEventListener("change", renderDayWise);
  renderDayWise();

  // ---- Month-wise ----
  const monthSelect = document.getElementById("monthSelect");
  const months = [];
  {
    let cursor = Utils.monthKey(earliest);
    const last = Utils.monthKey(today);
    while (cursor <= last) {
      months.push(cursor);
      const [y, m] = cursor.split("-").map(Number);
      const next = new Date(y, m, 1); // m is 1-indexed already -> next month
      cursor = Utils.monthKey(Utils.toISO(next));
    }
  }
  monthSelect.innerHTML = months.map((m) => `<option value="${m}">${Utils.monthLabel(m)}</option>`).join("");
  monthSelect.value = Utils.monthKey(today);

  function renderMonth() {
    const key = monthSelect.value;
    const [y, m] = key.split("-").map(Number);
    const from = `${key}-01`;
    const to = Utils.toISO(new Date(y, m, 0));
    const cappedTo = to > today ? today : to;
    const days = Attendance.dayWise(from, cappedTo).sort((a, b) => (a.date < b.date ? -1 : 1));
    const monthAgg = Attendance.aggregate(Attendance.enumerate(from, cappedTo));

    document.getElementById("monthStats").innerHTML = `
      <div class="stat-card"><div class="label">${Utils.monthLabel(key)}</div><div class="value">${Utils.formatPct(monthAgg.percentage)}</div></div>
      <div class="stat-card"><div class="label">Classes</div><div class="value">${monthAgg.total}</div></div>
      <div class="stat-card"><div class="label">Attended</div><div class="value present">${monthAgg.present}</div></div>
      <div class="stat-card"><div class="label">Absent</div><div class="value absent">${monthAgg.absent}</div></div>
      <div class="stat-card"><div class="label">Not held</div><div class="value holiday">${monthAgg.holiday}</div></div>
    `;

    const chartEl = document.getElementById("monthChart");
    if (days.length === 0) {
      chartEl.innerHTML = `<p class="muted">No scheduled classes recorded yet this month.</p>`;
    } else {
      Chart.renderBarChart(chartEl, {
        labels: days.map((d) => Utils.shortDisplayDate(d.date).split(" ")[0]),
        values: days.map((d) => d.percentage),
        targetValue: target,
        max: 100,
      });
    }
  }
  monthSelect.addEventListener("change", renderMonth);
  renderMonth();
})();
