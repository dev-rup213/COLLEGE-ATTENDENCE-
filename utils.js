/* ============================================================
   utils.js — date helpers, attendance math, small shared helpers
   ============================================================ */

const Utils = (() => {
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const DAY_NAMES_FULL = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
  ];
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  function todayISO() {
    return toISO(new Date());
  }

  function toISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function fromISO(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(iso, n) {
    const d = fromISO(iso);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }

  function dayShort(iso) {
    return DAY_NAMES[fromISO(iso).getDay()];
  }

  function dayFull(iso) {
    return DAY_NAMES_FULL[fromISO(iso).getDay()];
  }

  function displayDate(iso) {
    const d = fromISO(iso);
    return `${DAY_NAMES_FULL[d.getDay()]} — ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  function shortDisplayDate(iso) {
    const d = fromISO(iso);
    return `${String(d.getDate()).padStart(2, "0")} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
  }

  function monthKey(iso) {
    return iso.slice(0, 7); // YYYY-MM
  }

  function monthLabel(key) {
    const [y, m] = key.split("-").map(Number);
    return `${MONTH_NAMES[m - 1]} ${y}`;
  }

  function isFuture(iso) {
    return iso > todayISO();
  }

  function sortTime(a, b) {
    return (a || "").localeCompare(b || "");
  }

  // ---------- Attendance math ----------

  // counts = { present, absent, holiday }
  function percentage(counts) {
    const total = counts.present + counts.absent;
    if (total === 0) return null;
    return (counts.present / total) * 100;
  }

  function formatPct(pct) {
    if (pct === null || pct === undefined || isNaN(pct)) return "—";
    return pct.toFixed(1) + "%";
  }

  function pctTier(pct, target) {
    if (pct === null) return "mid";
    if (pct >= target) return "good";
    if (pct >= target - 10) return "mid";
    return "low";
  }

  // Classes still needed to reach target, given current present/absent
  // (excluding holidays). Assumes each future class, if attended,
  // adds 1 to both present and total.
  function classesNeededForTarget(present, total, targetPct) {
    const t = targetPct / 100;
    if (t <= 0) return 0;
    if (total === 0) return null; // no data yet
    if (present / total >= t) return 0;
    // solve smallest integer x >= 0 such that (present+x)/(total+x) >= t
    const x = (t * total - present) / (1 - t);
    return Math.max(0, Math.ceil(x - 1e-9));
  }

  // Classes that can still be missed (marked absent) while remaining
  // at/above target, given current present/total.
  function classesCanMissForTarget(present, total, targetPct) {
    const t = targetPct / 100;
    if (t <= 0) return null;
    if (present / total < t) return 0;
    // largest integer y >= 0 such that present/(total+y) >= t
    const y = present / t - total;
    return Math.max(0, Math.floor(y + 1e-9));
  }

  // ---------- Misc ----------

  function debounce(fn, ms) {
    let h;
    return (...args) => {
      clearTimeout(h);
      h = setTimeout(() => fn(...args), ms);
    };
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {
    DAY_NAMES, DAY_NAMES_FULL, MONTH_NAMES,
    todayISO, toISO, fromISO, addDays,
    dayShort, dayFull, displayDate, shortDisplayDate,
    monthKey, monthLabel, isFuture, sortTime,
    percentage, formatPct, pctTier,
    classesNeededForTarget, classesCanMissForTarget,
    debounce, escapeHtml, downloadFile,
  };
})();
