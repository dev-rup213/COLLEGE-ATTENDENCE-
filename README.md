/* ============================================================
   subjects.js — Subject-wise Attendance page
   ============================================================ */

(function () {
  const body = document.getElementById("subjectsBody");
  const routines = Storage.getRoutines();

  if (routines.length === 0) {
    App.guardNoRoutine(null, body);
    return;
  }

  const today = Utils.todayISO();
  const earliest = Attendance.earliestRoutineDate();
  const settings = Storage.getSettings();
  const target = settings.target ?? 75;

  const subjects = Attendance.subjectWise(earliest, today);

  body.innerHTML = `
    <div class="sheet sheet-ruled">
      ${subjects.length === 0
        ? `<div class="empty-note">No subject attendance recorded yet. Mark today's classes on the Daily Register.</div>`
        : `<div style="overflow-x:auto;">
            <table class="data-table" id="subjectsTable">
              <thead><tr><th>Subject</th><th>Classes</th><th>Present</th><th>Absent</th><th>Attendance</th><th></th></tr></thead>
              <tbody>
                ${subjects.map((s) => `
                  <tr class="clickable" data-subject="${Utils.escapeHtml(s.subject)}">
                    <td>${Utils.escapeHtml(s.subject)}${s.code ? ` <span class="muted">(${Utils.escapeHtml(s.code)})</span>` : ""}</td>
                    <td>${s.total}</td>
                    <td>${s.present}</td>
                    <td>${s.absent}</td>
                    <td>${Utils.formatPct(s.percentage)}</td>
                    <td><span class="pill ${Utils.pctTier(s.percentage, target)}">${
                      Utils.pctTier(s.percentage, target) === "good" ? "Good" :
                      Utils.pctTier(s.percentage, target) === "mid" ? "Borderline" : "Low"
                    }</span></td>
                  </tr>`).join("")}
              </tbody>
            </table>
          </div>`
      }
    </div>
    <div id="subjectDetail"></div>
  `;

  document.querySelectorAll("#subjectsTable tr[data-subject]").forEach((tr) => {
    tr.addEventListener("click", () => showDetail(tr.getAttribute("data-subject")));
  });

  function showDetail(subject) {
    const history = Attendance.subjectHistory(subject, earliest, today);
    const agg = Attendance.aggregate(history);
    const detail = document.getElementById("subjectDetail");
    detail.innerHTML = `
      <div class="sheet sheet-ruled">
        <div class="flex-between">
          <h2>${Utils.escapeHtml(subject)}</h2>
          <button class="btn btn-sm btn-ghost" id="closeDetail">Close ✕</button>
        </div>
        <div class="card-row" style="margin-bottom:0.9rem;">
          <div class="stat-card"><div class="label">Attendance</div><div class="value">${Utils.formatPct(agg.percentage)}</div></div>
          <div class="stat-card"><div class="label">Present</div><div class="value present">${agg.present}</div></div>
          <div class="stat-card"><div class="label">Absent</div><div class="value absent">${agg.absent}</div></div>
          <div class="stat-card"><div class="label">Not held</div><div class="value holiday">${agg.holiday}</div></div>
        </div>
        <div style="overflow-x:auto; max-height: 20rem; overflow-y:auto;">
          <table class="data-table">
            <thead><tr><th>Date</th><th>Time</th><th>Status</th></tr></thead>
            <tbody>
              ${history.map((h) => `
                <tr>
                  <td>${Utils.shortDisplayDate(h.date)}</td>
                  <td>${h.startTime || ""}${h.endTime ? "–" + h.endTime : ""}</td>
                  <td><span class="pill ${h.status === "present" ? "good" : h.status === "holiday" ? "mid" : "low"}">${h.status}</span></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
    document.getElementById("closeDetail").addEventListener("click", () => (detail.innerHTML = ""));
    detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
})();
