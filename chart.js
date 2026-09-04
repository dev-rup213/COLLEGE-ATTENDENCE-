/* ============================================================
   attendance.js — scheduling + aggregation engine

   A class is "scheduled" on a date if the routine active for that
   date has an entry whose `day` matches the date's weekday.

   Effective status for a scheduled class on a date:
     - an explicit saved record (present / absent / holiday), or
     - "absent" by default, for any date up to and including today
       (an unticked class is an absence — see spec §5/§6), or
     - not counted at all, for dates after today (nothing has
       happened yet, so it is excluded from every calculation).
   ============================================================ */

const Attendance = (() => {
  // All routines that could possibly apply within [fromISO, toISO],
  // keyed for quick lookup by date -> routine.
  function routineForDateCached(cache, iso) {
    if (!(iso in cache)) cache[iso] = Storage.getRoutineForDate(iso);
    return cache[iso];
  }

  // Enumerate every scheduled class instance between fromISO and
  // toISO inclusive. Returns [{ date, classId, subject, code, room,
  // startTime, endTime, day, routineId, status }]
  function enumerate(fromISO, toISO, filter) {
    const attAll = Storage.getAttendanceAll();
    const routineCache = {};
    const today = Utils.todayISO();
    const out = [];

    let cursor = fromISO;
    let guard = 0;
    while (cursor <= toISO && guard < 5000) {
      guard++;
      const routine = routineForDateCached(routineCache, cursor);
      if (routine) {
        const dow = Utils.dayShort(cursor);
        const dayClasses = routine.classes.filter((c) => c.day === dow);
        for (const cls of dayClasses) {
          const record = attAll[cursor] && attAll[cursor][cls.id];
          let status = record ? record.status : (cursor <= today ? "absent" : null);
          if (status === null) { cursor = Utils.addDays(cursor, 1); continue; }
          const item = {
            date: cursor,
            classId: cls.id,
            subject: cls.subject,
            code: cls.code || "",
            room: cls.room || "",
            faculty: cls.faculty || "",
            startTime: cls.startTime,
            endTime: cls.endTime,
            day: dow,
            routineId: routine.id,
            status,
            explicit: !!record,
          };
          if (!filter || filter(item)) out.push(item);
        }
      }
      cursor = Utils.addDays(cursor, 1);
    }
    return out;
  }

  function aggregate(items) {
    const c = { present: 0, absent: 0, holiday: 0 };
    for (const it of items) {
      if (it.status === "present") c.present++;
      else if (it.status === "absent") c.absent++;
      else if (it.status === "holiday") c.holiday++;
    }
    c.total = c.present + c.absent; // holidays excluded from total
    c.scheduled = c.present + c.absent + c.holiday;
    c.percentage = Utils.percentage(c);
    return c;
  }

  function overallStats(uptoISO) {
    const routines = Storage.getRoutines();
    if (routines.length === 0) return null;
    const earliest = routines.reduce((min, r) => (r.startDate < min ? r.startDate : min), routines[0].startDate);
    const items = enumerate(earliest, uptoISO || Utils.todayISO());
    return aggregate(items);
  }

  function dayWise(fromISO, toISO) {
    const items = enumerate(fromISO, toISO);
    const byDate = {};
    for (const it of items) {
      if (!byDate[it.date]) byDate[it.date] = [];
      byDate[it.date].push(it);
    }
    return Object.keys(byDate).sort().map((date) => ({
      date,
      ...aggregate(byDate[date]),
    }));
  }

  function monthWise(fromISO, toISO) {
    const items = enumerate(fromISO, toISO);
    const byMonth = {};
    for (const it of items) {
      const key = Utils.monthKey(it.date);
      if (!byMonth[key]) byMonth[key] = [];
      byMonth[key].push(it);
    }
    return Object.keys(byMonth).sort().map((key) => ({
      key,
      ...aggregate(byMonth[key]),
    }));
  }

  function subjectWise(fromISO, toISO) {
    const items = enumerate(fromISO, toISO);
    const bySubject = {};
    for (const it of items) {
      const key = it.subject;
      if (!bySubject[key]) bySubject[key] = { subject: key, code: it.code, items: [] };
      bySubject[key].items.push(it);
    }
    return Object.values(bySubject)
      .map((s) => ({ subject: s.subject, code: s.code, ...aggregate(s.items) }))
      .sort((a, b) => a.subject.localeCompare(b.subject));
  }

  function subjectHistory(subject, fromISO, toISO) {
    return enumerate(fromISO, toISO, (it) => it.subject === subject)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  function earliestRoutineDate() {
    const routines = Storage.getRoutines();
    if (routines.length === 0) return null;
    return routines.reduce((min, r) => (r.startDate < min ? r.startDate : min), routines[0].startDate);
  }

  return { enumerate, aggregate, overallStats, dayWise, monthWise, subjectWise, subjectHistory, earliestRoutineDate };
})();
