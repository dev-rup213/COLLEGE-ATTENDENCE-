/* ============================================================
   settings.js — Settings page
   ============================================================ */

(function () {
  const settings = Storage.getSettings();
  const targetInput = document.getElementById("targetInput");
  const lastBackupNote = document.getElementById("lastBackupNote");

  targetInput.value = settings.target ?? 75;
  renderBackupNote();

  function renderBackupNote() {
    const s = Storage.getSettings();
    lastBackupNote.textContent = s.lastBackup
      ? `Last backup: ${new Date(s.lastBackup).toLocaleString()}`
      : "Last backup: Never";
  }

  document.getElementById("saveTargetBtn").addEventListener("click", () => {
    const v = Number(targetInput.value);
    if (isNaN(v) || v < 0 || v > 100) { App.toast("Enter a target between 0 and 100."); return; }
    const s = Storage.getSettings();
    s.target = v;
    Storage.saveSettings(s);
    App.toast("Target saved.");
  });

  document.getElementById("exportJsonBtn").addEventListener("click", () => {
    const data = Storage.exportAll();
    Utils.downloadFile(
      `attendance-backup-${Utils.todayISO()}.json`,
      JSON.stringify(data, null, 2),
      "application/json"
    );
    const s = Storage.getSettings();
    s.lastBackup = new Date().toISOString();
    Storage.saveSettings(s);
    renderBackupNote();
    App.toast("Backup exported.");
  });

  document.getElementById("exportCsvBtn").addEventListener("click", () => {
    const all = Storage.getAttendanceAll();
    const rows = [["Date", "Subject", "Code", "Start", "End", "Status"]];
    Object.keys(all).sort().forEach((date) => {
      Object.values(all[date]).forEach((rec) => {
        rows.push([date, rec.subject || "", rec.code || "", rec.startTime || "", rec.endTime || "", rec.status]);
      });
    });
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    Utils.downloadFile(`attendance-${Utils.todayISO()}.csv`, csv, "text/csv");
    App.toast("Attendance exported as CSV.");
  });

  document.getElementById("importInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(reader.result);
        if (!confirm("Import this file? It will replace routines, attendance and settings currently stored here.")) return;
        Storage.importAll(payload);
        App.toast("Data imported.");
        setTimeout(() => window.location.reload(), 600);
      } catch (err) {
        console.error(err);
        App.toast("That file could not be read as a backup.");
      }
    };
    reader.readAsText(file);
  });

  document.getElementById("deleteAttendanceBtn").addEventListener("click", () => {
    if (confirm("Delete all attendance records? Routines are kept.")) {
      Storage.deleteAttendanceData();
      App.toast("Attendance data deleted.");
    }
  });

  document.getElementById("deleteRoutineBtn").addEventListener("click", () => {
    if (confirm("Delete all routines? Attendance history is kept.")) {
      Storage.deleteRoutineData();
      App.toast("Routines deleted.");
    }
  });

  document.getElementById("deleteAllBtn").addEventListener("click", () => {
    if (confirm("Delete everything — routines, attendance and settings? This cannot be undone.")) {
      if (confirm("This is permanent. Delete all data now?")) {
        Storage.deleteEverything();
        App.toast("All data deleted.");
        setTimeout(() => window.location.reload(), 600);
      }
    }
  });
})();
