/* ============================================================
   pdf-parse.js — best-effort PDF routine extraction

   Uses pdf.js (loaded from cdnjs in routine.html) to pull raw text
   out of an uploaded PDF, then applies simple heuristics to guess
   day / time / subject / code / room columns. This is intentionally
   a *best effort*: results always land in an editable table (see
   routine.js) and nothing is saved until the user confirms it.
   ============================================================ */

const PdfParse = (() => {
  const DAY_TOKENS = {
    mon: "Mon", monday: "Mon",
    tue: "Tue", tues: "Tue", tuesday: "Tue",
    wed: "Wed", wednesday: "Wed",
    thu: "Thu", thur: "Thu", thurs: "Thu", thursday: "Thu",
    fri: "Fri", friday: "Fri",
    sat: "Sat", saturday: "Sat",
    sun: "Sun", sunday: "Sun",
  };

  const TIME_RANGE_RE = /(\d{1,2}[:.]\d{2}\s?(?:AM|PM|am|pm)?)\s*(?:-|–|to)\s*(\d{1,2}[:.]\d{2}\s?(?:AM|PM|am|pm)?)/;

  async function extractText(file) {
    if (!window.pdfjsLib) throw new Error("PDF engine did not load. Check your connection and try again, or use manual entry.");
    const buf = await file.arrayBuffer();
    const doc = await window.pdfjsLib.getDocument({ data: buf }).promise;
    const lines = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      // group text items by approximate vertical position (row)
      const rows = {};
      content.items.forEach((item) => {
        const y = Math.round(item.transform[5] / 3) * 3; // bucket rows
        if (!rows[y]) rows[y] = [];
        rows[y].push(item.str);
      });
      const ys = Object.keys(rows).map(Number).sort((a, b) => b - a);
      ys.forEach((y) => {
        const line = rows[y].join(" ").replace(/\s+/g, " ").trim();
        if (line) lines.push(line);
      });
    }
    return lines;
  }

  function normalizeTime(t) {
    if (!t) return "";
    let s = t.trim().replace(".", ":");
    const ampm = /pm/i.test(s) ? "PM" : /am/i.test(s) ? "AM" : null;
    s = s.replace(/\s?(am|pm)/i, "");
    let [h, m] = s.split(":").map((x) => parseInt(x, 10));
    if (isNaN(h)) return "";
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    m = isNaN(m) ? 0 : m;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  function guessDay(line) {
    const words = line.toLowerCase().split(/[^a-z]+/);
    for (const w of words) {
      if (DAY_TOKENS[w]) return DAY_TOKENS[w];
    }
    return null;
  }

  // Parse extracted lines into best-guess class rows. Every row
  // needs a recognizable time range to be considered a class slot;
  // everything else is a guess the user is expected to correct.
  function parseRows(lines) {
    const rows = [];
    let lastDay = null;

    lines.forEach((line) => {
      const dayHere = guessDay(line);
      if (dayHere) lastDay = dayHere;

      const timeMatch = line.match(TIME_RANGE_RE);
      if (!timeMatch) return;

      const startTime = normalizeTime(timeMatch[1]);
      const endTime = normalizeTime(timeMatch[2]);

      // strip the day word and time range out, split the remainder
      // on 2+ spaces / tabs / pipes into candidate columns
      let remainder = line
        .replace(timeMatch[0], " ")
        .replace(/\b(mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sun|sunday)\b/gi, " ")
        .trim();
      const cols = remainder.split(/\s{2,}|\t|\|/).map((c) => c.trim()).filter(Boolean);

      let subject = cols[0] || remainder || "Untitled subject";
      let code = "";
      let room = "";

      if (cols.length >= 2) {
        // look for a short all-caps/alnum token that looks like a code
        const codeIdx = cols.findIndex((c, i) => i > 0 && /^[A-Z0-9]{2,8}$/.test(c));
        if (codeIdx > -1) { code = cols[codeIdx]; }
        const roomIdx = cols.findIndex((c, i) => i > 0 && /(room|hall|lab|\b\d{2,4}\b)/i.test(c));
        if (roomIdx > -1 && roomIdx !== codeIdx) { room = cols[roomIdx]; }
      }

      rows.push({
        id: Storage.genId("cls"),
        day: dayHere || lastDay || "Mon",
        startTime, endTime,
        subject: subject.replace(/[-–|]+$/, "").trim() || "Untitled subject",
        code, room, faculty: "",
      });
    });

    return rows;
  }

  return { extractText, parseRows };
})();
