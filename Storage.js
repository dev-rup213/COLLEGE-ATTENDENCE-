/* ============================================================
   storage.js — LocalStorage data layer
   Keys:
     cat_routines   -> array of Routine
     cat_attendance -> { "YYYY-MM-DD": { classId: AttendanceEntry } }
     cat_settings   -> Settings

   Routine   = { id, name, startDate, endDate, active, classes: [Class] }
   Class     = { id, day, startTime, endTime, subject, code, room, faculty }
   Attendance entry = { status: 'present'|'absent'|'holiday', subject,
                         code, startTime, endTime, routineId, day, savedAt }
   Settings  = { target, theme, lastBackup }
   ============================================================ */

const Storage = (() => {
  const KEYS = {
    routines: "cat_routines",
    attendance: "cat_attendance",
    settings: "cat_settings",
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.error("Storage read failed for", key, e);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.error("Storage write failed for", key, e);
      return false;
    }
  }

  function genId(prefix) {
    return (
      (prefix || "id") +
      "_" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8)
    );
  }

  // ---------- Routines ----------

  function getRoutines() {
    return read(KEYS.routines, []);
  }

  function saveRoutines(routines) {
    return write(KEYS.routines, routines);
  }

  function getRoutine(id) {
    return getRoutines().find((r) => r.id === id) || null;
  }

  function upsertRoutine(routine) {
    const routines = getRoutines();
    const idx = routines.findIndex((r) => r.id === routine.id);
    if (idx === -1) routines.push(routine);
    else routines[idx] = routine;
    saveRoutines(routines);
    return routine;
  }

  function deleteRoutine(id) {
    const routines = getRoutines().filter((r) => r.id !== id);
    saveRoutines(routines);
  }

  function setActiveRoutine(id) {
    const routines = getRoutines();
    routines.forEach((r) => (r.active = r.id === id));
    saveRoutines(routines);
  }

  // Find the routine that governs a given ISO date: prefer a routine
  // whose [startDate, endDate] window contains the date; if several
  // match, the one with the latest startDate wins; otherwise fall
  // back to whichever routine is flagged active.
  function getRoutineForDate(isoDate) {
    const routines = getRoutines();
    const inRange = routines.filter((r) => {
      if (!r.startDate) return false;
      if (r.startDate > isoDate) return false;
      if (r.endDate && r.endDate < isoDate) return false;
      return true;
    });
    if (inRange.length > 0) {
      inRange.sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
      return inRange[0];
    }
    return routines.find((r) => r.active) || null;
  }

  // ---------- Attendance ----------

  function getAttendanceAll() {
    return read(KEYS.attendance, {});
  }

  function saveAttendanceAll(data) {
    return write(KEYS.attendance, data);
  }

  function getAttendanceForDate(isoDate) {
    const all = getAttendanceAll();
    return all[isoDate] || {};
  }

  function setAttendanceEntry(isoDate, classId, entry) {
    const all = getAttendanceAll();
    if (!all[isoDate]) all[isoDate] = {};
    all[isoDate][classId] = entry;
    saveAttendanceAll(all);
  }

  function clearAttendanceEntry(isoDate, classId) {
    const all = getAttendanceAll();
    if (all[isoDate] && all[isoDate][classId]) {
      delete all[isoDate][classId];
      if (Object.keys(all[isoDate]).length === 0) delete all[isoDate];
      saveAttendanceAll(all);
    }
  }

  // ---------- Settings ----------

  function getSettings() {
    return read(KEYS.settings, { target: 75, theme: "light", lastBackup: null });
  }

  function saveSettings(settings) {
    return write(KEYS.settings, settings);
  }

  // ---------- Bulk / reset ----------

  function exportAll() {
    return {
      exportedAt: new Date().toISOString(),
      version: 1,
      routines: getRoutines(),
      attendance: getAttendanceAll(),
      settings: getSettings(),
    };
  }

  function importAll(payload) {
    if (!payload || typeof payload !== "object") throw new Error("Invalid file");
    if (Array.isArray(payload.routines)) saveRoutines(payload.routines);
    if (payload.attendance && typeof payload.attendance === "object")
      saveAttendanceAll(payload.attendance);
    if (payload.settings && typeof payload.settings === "object")
      saveSettings(payload.settings);
  }

  function deleteAttendanceData() {
    write(KEYS.attendance, {});
  }

  function deleteRoutineData() {
    write(KEYS.routines, []);
  }

  function deleteEverything() {
    localStorage.removeItem(KEYS.routines);
    localStorage.removeItem(KEYS.attendance);
    localStorage.removeItem(KEYS.settings);
  }

  return {
    KEYS,
    genId,
    getRoutines,
    saveRoutines,
    getRoutine,
    upsertRoutine,
    deleteRoutine,
    setActiveRoutine,
    getRoutineForDate,
    getAttendanceAll,
    saveAttendanceAll,
    getAttendanceForDate,
    setAttendanceEntry,
    clearAttendanceEntry,
    getSettings,
    saveSettings,
    exportAll,
    importAll,
    deleteAttendanceData,
    deleteRoutineData,
    deleteEverything,
  };
})();
