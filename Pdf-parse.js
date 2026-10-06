/* ============================================================
   pdf-parse.js — automatic class-routine extraction (v3)

   Public API (unchanged, so routine.js keeps working):
     PdfParse.extractText(file, onProgress?) -> Promise<string[]>
     PdfParse.parseRows(lines)               -> row objects
         { id, day, startTime, endTime, subject, code, room, faculty }

   Handles three kinds of input:
     1. Text PDFs laid out as lines   ("Mon | 10:00-11:00 | Company Law | Room 12")
     2. Text PDFs laid out as a grid  (days down the side, time slots across the
        top — or the other way round), including multi-line cells
     3. Scanned PDFs and photos/screenshots (png/jpg) via Tesseract.js OCR
        (optional: only used if the Tesseract.js script is loaded)

   extractText() returns the usual array of lines, with the positioned text
   attached as lines.pages (used by parseRows to detect grids) and lines.ocr.
   parseRows() sets rows.meta = { method: "grid" | "lines", ocr: boolean }
   so the UI can tell the user to double-check OCR results.

   Nothing here saves anything: results are meant for the editable preview
   table, and the user confirms before they are stored.
   ============================================================ */

const PdfParse = (() => {
  /* ---------- constants ---------- */

  const DAY_TOKENS = {
    mon: "Mon", monday: "Mon",
    tue: "Tue", tues: "Tue", tuesday: "Tue",
    wed: "Wed", wednesday: "Wed",
    thu: "Thu", thur: "Thu", thurs: "Thu", thursday: "Thu",
    fri: "Fri", friday: "Fri",
    sat: "Sat", saturday: "Sat",
    sun: "Sun", sunday: "Sun",
  };
  const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DAY_WORDS = Object.keys(DAY_TOKENS).sort((a, b) => b.length - a.length).join("|");
  const LEADING_DAY_RE = new RegExp("^(?:" + DAY_WORDS + ")\\b[.,:]?\\s*", "i");

  const CLOCK = "(\\d{1,2}(?:[:.]\\d{2})?)\\s?(AM|PM)?";
  const TIME_RANGE_RE = new RegExp(CLOCK + "\\s*(?:-|–|—|to)\\s*" + CLOCK, "i");

  const FACULTY_RE = /^(?:prof|dr|mr|mrs|ms|sir|madam)\b\.?/i;
  const ROOM_RE = /^(?:(?:room|rm|hall|lab|lt)\b[\s.-]*(?:[A-Za-z]?\d{1,4}[A-Za-z]?|[A-Za-z])|\d{2,4}[A-Z]?)$/i; // "Room 12", "Lab 3", "Hall A", "204" — not "Lab Work"
  const CODE_RE = /^(?=[A-Z0-9-]*[A-Z])[A-Z0-9-]{2,10}$/;
  const SKIP_CELL_RE = /^(?:lunch(?:\s*break)?|break|short\s*break|recess|interval|nil|free|[-–—x\s]+)$/i;
  const HEADER_WORDS = new Set(["day", "days", "time", "times", "period", "periods", "lecture", "lectures", "hour", "hours", "slot", "slots", "am", "pm", "to"]);
  const JUNK_WORD_RE = /^[|_=~¦\[\]{}\\\/<>]+$/; // OCR noise from table borders

  const MIN_TEXT_ITEMS = 10; // fewer text items than this => treat the PDF as scanned

  /* ---------- small helpers ---------- */

  const normDay = (s) => DAY_TOKENS[String(s).toLowerCase().replace(/[^a-z]/g, "")] || null;

  function median(arr) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /* ---------- positioned text -> visual rows ---------- */

  // item: { str, x, w, h, cy }   (x = left edge, cy = vertical centre, y grows downward)
  function clusterRows(items) {
    const sorted = items.slice().sort((a, b) => a.cy - b.cy || a.x - b.x);
    const rows = [];
    sorted.forEach((it) => {
      const row = rows[rows.length - 1];
      if (row && Math.abs(row.cy - it.cy) <= Math.max(2, Math.max(it.h, row.h) * 0.5)) {
        row.items.push(it);
        row.h = Math.max(row.h, it.h);
      } else {
        rows.push({ cy: it.cy, h: it.h, items: [it] });
      }
    });
    rows.forEach((r) => r.items.sort((a, b) => a.x - b.x));
    return rows;
  }

  // One line of text; large horizontal gaps become " | " column separators.
  function rowToLine(row) {
    let out = "";
    let prevEnd = null;
    row.items.forEach((it) => {
      if (prevEnd !== null) {
        const gap = it.x - prevEnd;
        out += gap > it.h * 0.9 ? " | " : gap < it.h * 0.1 ? "" : " ";
      }
      out += it.str;
      prevEnd = it.x + it.w;
    });
    return out.replace(/\s+/g, " ").trim();
  }

  function linesFromPages(pages) {
    const out = [];
    pages.forEach((p) => {
      clusterRows(p.items).forEach((r) => {
        const l = rowToLine(r);
        if (l) out.push(l);
      });
    });
    return out;
  }

  /* ---------- OCR (optional, needs Tesseract.js) ---------- */

  function ocrWords(data) {
    let words = Array.isArray(data.words) ? data.words : [];
    if (!words.length && Array.isArray(data.blocks)) {
      data.blocks.forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => (l.words || []).forEach((w) => words.push(w)))));
    }
    return words;
  }

  function wordsToItems(words) {
    const items = [];
    words.forEach((w) => {
      const str = (w.text || "").trim();
      const b = w.bbox;
      if (!str || !b || JUNK_WORD_RE.test(str)) return;
      if (typeof w.confidence === "number" && w.confidence < 30) return;
      items.push({ str, x: b.x0, w: b.x1 - b.x0, h: Math.max(1, b.y1 - b.y0), cy: (b.y0 + b.y1) / 2 });
    });
    return items;
  }

  async function createOcrWorker(say) {
    const T = window.Tesseract;
    const worker = await T.createWorker("eng", 1, {
      logger: (m) => { if (m && m.status === "recognizing text") say({ stage: "ocr", progress: m.progress }); },
    });
    try { await worker.setParameters({ tessedit_pageseg_mode: "11" }); } catch (e) { /* sparse-text mode is a nicety */ }
    return worker;
  }

  async function recognizeCanvas(worker, canvas) {
    let res = await worker.recognize(canvas);
    let words = ocrWords(res.data || {});
    if (!words.length) { // newer Tesseract.js versions only return blocks when asked
      try { res = await worker.recognize(canvas, {}, { blocks: true }); words = ocrWords(res.data || {}); } catch (e) { /* ignore */ }
    }
    return { width: canvas.width, height: canvas.height, items: wordsToItems(words) };
  }

  async function ocrPdf(doc, say) {
    const worker = await createOcrWorker(say);
    const pages = [];
    try {
      for (let p = 1; p <= doc.numPages; p++) {
        say({ stage: "ocr", page: p, total: doc.numPages });
        const page = await doc.getPage(p);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.min(3, Math.max(1.5, 2000 / base.width));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, canvas, viewport }).promise;
        pages.push(await recognizeCanvas(worker, canvas));
        canvas.width = 0; canvas.height = 0;
        page.cleanup();
      }
    } finally {
      await worker.terminate();
    }
    return pages;
  }

  async function ocrImage(file, say) {
    const worker = await createOcrWorker(say);
    try {
      const bmp = await createImageBitmap(file);
      const scale = bmp.width < 1600 ? Math.min(3, 2000 / bmp.width) : 1;
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(bmp.width * scale);
      canvas.height = Math.floor(bmp.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const page = await recognizeCanvas(worker, canvas);
      canvas.width = 0; canvas.height = 0;
      return [page];
    } finally {
      await worker.terminate();
    }
  }

  /* ---------- file -> lines (+ positioned pages) ---------- */

  function noTextError(msg) {
    const err = new Error(msg);
    err.code = "NO_TEXT";
    return err;
  }

  async function extractText(file, onProgress) {
    const say = (o) => { try { if (onProgress) onProgress(o); } catch (e) { /* UI errors must not break parsing */ } };
    const name = file.name || "";
    const isImage = /^image\//.test(file.type || "") || /\.(png|jpe?g|webp|bmp)$/i.test(name);
    const hasOcr = !!(window.Tesseract && window.Tesseract.createWorker);
    let pages = [];
    let ocr = false;

    if (isImage) {
      if (!hasOcr) throw noTextError("Reading images needs the OCR engine (Tesseract.js), which did not load. Check your connection or use manual entry.");
      pages = await ocrImage(file, say);
      ocr = true;
    } else {
      if (!window.pdfjsLib) throw new Error("PDF engine did not load. Check your connection and try again, or use manual entry.");
      if (file.type && file.type !== "application/pdf" && !/\.pdf$/i.test(name)) throw new Error("Please choose a PDF or an image of the routine.");

      const buf = await file.arrayBuffer();
      let doc;
      try {
        doc = await window.pdfjsLib.getDocument({ data: buf }).promise;
      } catch (e) {
        if (e && e.name === "PasswordException") throw new Error("This PDF is password-protected. Remove the password and try again.");
        throw new Error("Could not read this PDF. The file may be damaged.");
      }

      try {
        let itemCount = 0;
        for (let p = 1; p <= doc.numPages; p++) {
          say({ stage: "text", page: p, total: doc.numPages });
          const page = await doc.getPage(p);
          const vp = page.getViewport({ scale: 1 });
          const { items } = await page.getTextContent();
          const mapped = [];
          items.forEach((it) => {
            const str = (it.str || "").trim();
            if (!str) return;
            const h = it.height || Math.abs(it.transform[3]) || 10;
            mapped.push({ str, x: it.transform[4], w: it.width || 0, h, cy: vp.height - it.transform[5] - h * 0.3 });
          });
          itemCount += mapped.length;
          pages.push({ width: vp.width, height: vp.height, items: mapped });
          page.cleanup();
        }

        if (itemCount < MIN_TEXT_ITEMS) { // scanned / image-only PDF
          if (!hasOcr) throw noTextError("This PDF has no selectable text (it looks scanned) and the OCR engine did not load. Use manual entry or upload a text-based PDF.");
          pages = await ocrPdf(doc, say);
          ocr = true;
        }
      } finally {
        doc.destroy();
      }
    }

    const lines = linesFromPages(pages);
    if (!lines.length) throw noTextError("No readable text was found in this file. Try a clearer copy or use manual entry.");
    lines.pages = pages;
    lines.ocr = ocr;
    return lines;
  }

  /* ---------- time helpers ---------- */

  function splitClock(raw) {
    const [h, m] = raw.split(/[:.]/).map((x) => parseInt(x, 10));
    return { h, m: isNaN(m) ? 0 : m };
  }

  function to24(h, ap) {
    if (ap === "PM" && h < 12) return h + 12;
    if (ap === "AM" && h === 12) return 0;
    return h;
  }

  const hhmm = (h, m) => String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");

  // TIME_RANGE_RE match -> { start, end } as "HH:MM", or null if it is not a sane range.
  function resolveRange(m) {
    const a = splitClock(m[1]);
    const b = splitClock(m[3]);
    let ap1 = m[2] ? m[2].toUpperCase() : null;
    const ap2 = m[4] ? m[4].toUpperCase() : null;

    if (a.h > 24 || b.h > 24 || a.m > 59 || b.m > 59) return null;

    if (!ap1 && ap2) {
      // "1:00 - 2:00 PM": start shares the end's marker, unless that runs backwards ("11:00 - 1:00 PM")
      ap1 = ap2;
      if (to24(a.h, ap1) > to24(b.h, ap2)) ap1 = ap2 === "PM" ? "AM" : "PM";
    }

    let sh = to24(a.h, ap1);
    let eh = to24(b.h, ap2 || ap1);

    if (!ap1 && !ap2) {
      // no markers: classes don't start before ~8am, so hours 1–7 mean afternoon
      if (sh < 8) sh += 12;
      if (eh < 8) eh += 12;
      if (eh <= sh && eh + 12 < 24) eh += 12;
    }

    if (sh > 23 || eh > 23) return null;
    if (eh * 60 + b.m <= sh * 60 + a.m) return null;
    return { start: hhmm(sh, a.m), end: hhmm(eh, b.m) };
  }

  /* ---------- turning a block of cell text into subject / code / room / faculty ---------- */

  function splitInline(s) {
    return s.split(/\s+[-–—\/]\s+|\s*[,|;]\s*|\s*[()]\s*/).map((x) => x.trim()).filter(Boolean);
  }

  function parseCell(cellLines, subjectFirst) {
    let parts = cellLines.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (!parts.length) return null;
    if (SKIP_CELL_RE.test(parts.join(" "))) return null;
    if (parts.length === 1) parts = splitInline(parts[0]);

    const found = { code: "", room: "", faculty: "" };
    const extra = [];
    let subject = "";

    parts.forEach((p, i) => {
      if (i === 0 && subjectFirst) subject = p;
      else if (!found.faculty && FACULTY_RE.test(p)) found.faculty = p;
      else if (!found.room && ROOM_RE.test(p)) found.room = p;
      else if (!found.code && CODE_RE.test(p) && (i > 0 || parts.length > 1)) found.code = p;
      else if (!subject) subject = p;
      else if (/(?:&|\band|\bof|\bthe|\bfor|\bin|\bto|-)$/i.test(subject) || /^[a-z(]/.test(p) || /^(?:[IVX]{1,4}|\d|[A-Z])$/.test(p)) subject += " " + p;
      else extra.push(p);
    });

    if (!subject && found.code) { subject = found.code; found.code = ""; }
    if (!found.faculty && extra.length) found.faculty = extra[0];

    subject = subject.replace(/[-–|]+$/, "").trim();
    if (subject.length < 2 || /^[\W\d_]+$/.test(subject)) return null;
    return { subject, code: found.code, room: found.room, faculty: found.faculty };
  }

  function makeRow(day, range, cell) {
    return {
      id: Storage.genId("cls"),
      day,
      startTime: range.start,
      endTime: range.end,
      subject: cell.subject,
      code: cell.code,
      room: cell.room,
      faculty: cell.faculty,
    };
  }

  /* ---------- strategy 1: line-based routines ---------- */

  function guessDay(cells) {
    for (const c of cells) {
      const d = normDay(c);
      if (d) return d;
    }
    const first = (cells[0] || "").toLowerCase().split(/[^a-z]+/)[0];
    return DAY_TOKENS[first] || null;
  }

  function parseLineRows(lines) {
    const rows = [];
    let lastDay = null;

    lines.forEach((line) => {
      const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
      const flat = cells.join(" ");

      const dayHere = guessDay(cells);
      if (dayHere) lastDay = dayHere;

      const tm = flat.match(TIME_RANGE_RE);
      if (!tm) return;

      // a bare range like "10-11" is only trusted when it sits alone in its own cell
      const hit = cells.findIndex((c) => TIME_RANGE_RE.test(c));
      const hasClockMarks = /[:.]|am|pm/i.test(tm[0]);
      if (!hasClockMarks && !(hit > -1 && cells[hit].trim() === tm[0].trim())) return;

      const range = resolveRange(tm);
      if (!range) return;

      let cols = hit > -1
        ? cells.map((c, i) => (i === hit ? c.replace(TIME_RANGE_RE, " ") : c))
        : [flat.replace(TIME_RANGE_RE, " ")];
      cols = cols
        // only the line's first cell can carry a leading day name ("Mon 10:00 ..."); later cells are left alone
        .map((c, i) => (i === 0 ? c.replace(LEADING_DAY_RE, "") : c).replace(/\s+/g, " ").trim())
        .filter((c) => c && !normDay(c));
      if (!cols.length) cols = ["Untitled subject"];

      // subject is normally the first column; if that looks like a course code, prefer a wordier one
      let subjectIdx = 0;
      if (cols.length > 1 && CODE_RE.test(cols[0])) {
        const alt = cols.findIndex((c, i) => i > 0 && /[a-z]/.test(c) && !FACULTY_RE.test(c) && !ROOM_RE.test(c));
        if (alt > -1) subjectIdx = alt;
      }

      const ordered = [cols[subjectIdx]].concat(cols.filter((_, i) => i !== subjectIdx));
      const cell = parseCell(ordered, true) || { subject: "Untitled subject", code: "", room: "", faculty: "" };
      rows.push(makeRow(dayHere || lastDay || "Mon", range, cell));
    });

    return rows;
  }

  /* ---------- strategy 2: grid timetables ---------- */

  function rowSpans(row) {
    let text = "";
    const spans = [];
    row.items.forEach((it, i) => {
      if (i) text += " ";
      spans.push({ s: text.length, e: text.length + it.str.length, it });
      text += it.str;
    });
    return { text, spans };
  }

  // every time range in a visual row, with its horizontal position
  function timesInRow(row) {
    const { text, spans } = rowSpans(row);
    const re = new RegExp(TIME_RANGE_RE.source, "gi");
    const out = [];
    let m;
    while ((m = re.exec(text))) {
      const range = resolveRange(m);
      if (!range) continue;
      const end = m.index + m[0].length;
      const hit = spans.filter((sp) => sp.s < end && sp.e > m.index);
      if (!hit.length) continue;
      const x0 = Math.min(...hit.map((h) => h.it.x));
      const x1 = Math.max(...hit.map((h) => h.it.x + h.it.w));
      out.push({ range, cx: (x0 + x1) / 2, items: hit.map((h) => h.it) });
    }
    return out;
  }

  function leftoverWords(text) {
    return text
      .replace(new RegExp(TIME_RANGE_RE.source, "gi"), " ")
      .split(/[^A-Za-z]+/)
      .filter((w) => w.length > 1 && !HEADER_WORDS.has(w.toLowerCase()));
  }

  // header = row of time slots; day names run down the left edge
  function tryTimesAcross(rows, timesPerRow) {
    let hi = -1;
    let best = 1;
    timesPerRow.forEach((t, i) => { if (t.length > best) { best = t.length; hi = i; } });
    if (hi < 0) return null;
    const row = rows[hi];
    if (row.items.some((it) => normDay(it.str))) return null;
    if (leftoverWords(rowSpans(row).text).length > 4) return null;

    const cols = timesPerRow[hi].slice().sort((a, b) => a.cx - b.cx).map((t) => ({ cx: t.cx, range: t.range, items: t.items }));
    const pitch = (cols[cols.length - 1].cx - cols[0].cx) / (cols.length - 1);
    const limit = cols[0].cx - pitch / 2 + pitch * 0.1;

    const labels = [];
    for (let i = hi + 1; i < rows.length; i++) {
      rows[i].items.forEach((it) => {
        const d = normDay(it.str);
        if (d && it.x + it.w / 2 < limit) labels.push({ cy: it.cy, day: d, items: [it] });
      });
    }
    if (labels.length < (cols.length >= 3 ? 1 : 2)) return null; // 1 label = a table that continues from the previous page
    return { orientation: "A", headerRow: hi, cols, labels, limit };
  }

  // header = row of day names; time slots run down the left edge
  function tryDaysAcross(rows, timesPerRow) {
    let hi = -1;
    let best = 1;
    rows.forEach((r, i) => {
      const n = r.items.filter((it) => normDay(it.str)).length;
      if (n > best) { best = n; hi = i; }
    });
    if (hi < 0) return null;
    const row = rows[hi];
    if (timesPerRow[hi].length) return null;
    if (leftoverWords(rowSpans(row).text.replace(new RegExp("\\b(?:" + DAY_WORDS + ")\\b", "gi"), " ")).length > 3) return null;

    const cols = row.items.filter((it) => normDay(it.str)).map((it) => ({ cx: it.x + it.w / 2, day: normDay(it.str), items: [it] })).sort((a, b) => a.cx - b.cx);
    const pitch = (cols[cols.length - 1].cx - cols[0].cx) / (cols.length - 1);
    const limit = cols[0].cx - pitch / 2 + pitch * 0.1;

    const labels = [];
    for (let i = hi + 1; i < rows.length; i++) {
      timesPerRow[i].forEach((t) => {
        if (t.cx < limit) labels.push({ cy: rows[i].cy, range: t.range, items: t.items });
      });
    }
    if (labels.length < (cols.length >= 3 ? 1 : 2)) return null;
    return { orientation: "B", headerRow: hi, cols, labels, limit };
  }

  function detectGrid(page) {
    const rows = clusterRows(page.items);
    if (rows.length < 3) return null;
    const timesPerRow = rows.map(timesInRow);
    const A = tryTimesAcross(rows, timesPerRow);
    const B = tryDaysAcross(rows, timesPerRow);
    let g = null;
    if (A && B) g = A.cols.length + A.labels.length >= B.cols.length + B.labels.length ? A : B;
    else g = A || B;
    if (g) g.rows = rows;
    return g;
  }

  // Row-band edges. A cell's label may sit at the top, middle or bottom of its band, so each edge
  // between two labels is placed in the widest empty vertical gap found between them.
  function bandEdges(anchors, ys, top, eps) {
    const n = anchors.length;
    const edges = [top];
    const gaps = [];
    for (let i = 1; i < n; i++) {
      const lo = anchors[i - 1].cy - eps;
      const hi = anchors[i].cy + eps;
      const win = ys.filter((y) => y >= lo && y <= hi);
      let edge = (anchors[i - 1].cy + anchors[i].cy) / 2;
      let bestGap = 0;
      for (let k = 1; k < win.length; k++) {
        const gap = win[k] - win[k - 1];
        if (gap > bestGap) { bestGap = gap; edge = (win[k] + win[k - 1]) / 2; }
      }
      gaps.push(bestGap);
      edges.push(edge);
    }
    // stop the last band where the table ends (a gap as wide as the usual row gap)
    let lim = median(gaps.filter((g) => g > 0));
    if (!lim) {
      const rowGaps = [];
      for (let k = 1; k < ys.length; k++) rowGaps.push(ys[k] - ys[k - 1]);
      lim = 2.2 * median(rowGaps);
    }
    let last = Infinity;
    if (lim) {
      const tail = ys.filter((y) => y >= anchors[n - 1].cy - eps);
      for (let k = 1; k < tail.length; k++) {
        if (tail[k] - tail[k - 1] >= 0.95 * lim) { last = (tail[k] + tail[k - 1]) / 2; break; }
      }
    }
    edges.push(last);
    return edges;
  }

  function readGrid(g) {
    const rows = g.rows;
    const header = rows[g.headerRow];
    const exclude = new Set(header.items);
    g.labels.forEach((l) => l.items.forEach((it) => exclude.add(it)));
    g.cols.forEach((c) => c.items.forEach((it) => exclude.add(it)));

    const content = [];
    for (let i = g.headerRow + 1; i < rows.length; i++) {
      rows[i].items.forEach((it) => {
        if (!exclude.has(it) && it.x + it.w / 2 >= g.limit) content.push(it);
      });
    }
    if (!content.length) return [];

    const anchors = g.labels.slice().sort((a, b) => a.cy - b.cy);
    const ys = clusterRows(content).map((r) => r.cy);
    const eps = Math.max(1, median(content.map((it) => it.h))) * 0.5;
    const edges = bandEdges(anchors, ys, header.cy + header.h * 0.6, eps);

    const bandOf = (cy) => {
      for (let b = 0; b < anchors.length; b++) if (cy >= edges[b] && cy < edges[b + 1]) return b;
      return -1;
    };
    const colOf = (cx) => {
      let best = 0;
      let d = Infinity;
      g.cols.forEach((c, i) => { const dd = Math.abs(c.cx - cx); if (dd < d) { d = dd; best = i; } });
      return best;
    };

    const cells = new Map();
    content.forEach((it) => {
      const b = bandOf(it.cy);
      if (b < 0) return;
      const key = b + "|" + colOf(it.x + it.w / 2);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(it);
    });

    const out = [];
    for (let b = 0; b < anchors.length; b++) {
      for (let c = 0; c < g.cols.length; c++) {
        const items = cells.get(b + "|" + c);
        if (!items) continue;
        const cellLines = clusterRows(items).map((r) => r.items.map((it) => it.str).join(" "));
        const cell = parseCell(cellLines);
        if (!cell) continue;
        const day = g.orientation === "A" ? anchors[b].day : g.cols[c].day;
        const range = g.orientation === "A" ? g.cols[c].range : anchors[b].range;
        out.push(makeRow(day, range, cell));
      }
    }
    return out;
  }

  /* ---------- entry point ---------- */

  function dedupe(rows) {
    const seen = new Set();
    return rows.filter((r) => {
      const key = [r.day, r.startTime, r.endTime, r.subject.toLowerCase()].join("|");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function parseRows(lines) {
    let rows = [];
    let method = "lines";

    if (lines && lines.pages) {
      const gridRows = [];
      lines.pages.forEach((page) => {
        const g = detectGrid(page);
        if (g) readGrid(g).forEach((r) => gridRows.push(r));
      });
      if (gridRows.length) {
        rows = gridRows;
        method = "grid";
      }
    }
    if (!rows.length) rows = parseLineRows(lines || []);

    rows = dedupe(rows);
    rows.sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day) || a.startTime.localeCompare(b.startTime));
    rows.meta = { method, ocr: !!(lines && lines.ocr) };
    return rows;
  }

  return { extractText, parseRows };
})();
