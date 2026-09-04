/* ============================================================
   register.js — Daily Attendance Register page
   ============================================================ */

(function () {
  const dateInput = document.getElementById("dateInput");
  const dateHeading = document.getElementById("dateHeading");
  const classList = document.getElementById("classList");
  const routineNote = document.getElementById("routineNote");

  const urlParams = new URLSearchParams(window.location.search);
  let currentDate = urlParams.get("date") || Utils.todayISO();

  function render() {
    dateInput.value = currentDate;
    dateHeading.textContent = Utils.displayDate(currentDate);

    const routine = Storage.getRoutineForDate(currentDate);
    if (App.guardNoRoutine(routine, classList)) {
      routineNote.textContent = "";
      return;
    }

    const dow = Utils.dayShort(currentDate);
    const classes = routine.classes
      .filter((c) => c.day === dow)
      .slice()
      .sort((a, b) => Utils.sortTime(a.startTime, b.startTime));

    routineNote.textContent = `Using routine: ${routine.name}`;

    if (classes.length === 0) {
      classList.innerHTML = `<div class="empty-note">No classes scheduled for this day.</div>`;
      return;
    }

    const dayRecords = Storage.getAttendanceForDate(currentDate);

    classList.innerHTML = classes.map((cls) => {
      const record = dayRecords[cls.id];
      const status = record ? record.status : null;
      const meta = [cls.code, cls.room ? `Room ${cls.room}` : "", cls.faculty]
        .filter(Boolean).join(" · ");
      return `
        <div class="class-row" data-class-id="${cls.id}">
          <div class="class-time">${cls.startTime || ""}${cls.endTime ? "–" + cls.endTime : ""}</div>
          <div>
            <div class="class-subject">${Utils.escapeHtml(cls.subject)}</div>
            ${meta ? `<div class="class-meta">${Utils.escapeHtml(meta)}</div>` : ""}
          </div>
          <div class="status-group" role="group" aria-label="Attendance status for ${Utils.escapeHtml(cls.subject)}">
            <button class="status-btn" data-status="present" class-target="${cls.id}">✓ Present</button>
            <button class="status-btn" data-status="absent" class-target="${cls.id}">✗ Absent</button>
            <button class="status-btn" data-status="holiday" class-target="${cls.id}">— Holiday</button>
          </div>
        </div>`;
    }).join("");

    // paint active states
    classes.forEach((cls) => {
      const record = dayRecords[cls.id];
      const row = classList.querySelector(`.class-row[data-class-id="${cls.id}"]`);
      if (record) {
        const btn = row.querySelector(`.status-btn[data-status="${record.status}"]`);
        if (btn) btn.classList.add("active");
      }
    });

    // wire up clicks
    classList.querySelectorAll(".class-row").forEach((row) => {
      const classId = row.getAttribute("data-class-id");
      const cls = classes.find((c) => c.id === classId);
      row.querySelectorAll(".status-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const status = btn.getAttribute("data-status");
          const currentlyActive = btn.classList.contains("active");
          if (currentlyActive) {
            Storage.clearAttendanceEntry(currentDate, classId);
            App.toast("Mark cleared.");
          } else {
            Storage.setAttendanceEntry(currentDate, classId, {
              status,
              subject: cls.subject,
              code: cls.code || "",
              startTime: cls.startTime,
              endTime: cls.endTime,
              routineId: routine.id,
              day: dow,
              savedAt: new Date().toISOString(),
            });
            App.toast("Attendance saved.");
          }
          render();
        });
      });
    });
  }

  document.getElementById("prevDay").addEventListener("click", () => {
    currentDate = Utils.addDays(currentDate, -1);
    render();
  });
  document.getElementById("nextDay").addEventListener("click", () => {
    currentDate = Utils.addDays(currentDate, 1);
    render();
  });
  document.getElementById("todayBtn").addEventListener("click", () => {
    currentDate = Utils.todayISO();
    render();
  });
  dateInput.addEventListener("change", () => {
    if (dateInput.value) {
      currentDate = dateInput.value;
      render();
    }
  });

  render();
})();
