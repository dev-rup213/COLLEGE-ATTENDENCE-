/* ============================================================
   routine.js — Routine management page
   ============================================================ */

(function () {
  const listEl = document.getElementById("routineList");
  const backdrop = document.getElementById("editorBackdrop");
  const editorTitle = document.getElementById("editorTitle");
  const rName = document.getElementById("rName");
  const rStart = document.getElementById("rStart");
  const rEnd = document.getElementById("rEnd");
  const classBody = document.getElementById("classEditBody");
  const pdfInput = document.getElementById("pdfInput");
  const pdfStatus = document.getElementById("pdfStatus");
  const deleteBtn = document.getElementById("deleteRoutineBtn");

  const DAY_OPTIONS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  let editingId = null;
  let draftClasses = [];

  function renderList() {
    const routines = Storage.getRoutines().slice().sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
    if (routines.length === 0) {
      listEl.innerHTML = `<div class="sheet empty-note">No routines yet. Create one to start recording attendance.</div>`;
      return;
    }
    listEl.innerHTML = routines.map((r) => `
      <div class="sheet sheet-ruled">
        <div class="flex-between">
          <div>
            <h3>${Utils.escapeHtml(r.name)} ${r.active ? '<span class="pill good">Active</span>' : ""}</h3>
            <p class="muted">${r.startDate}${r.endDate ? " → " + r.endDate : " → ongoing"} · ${r.classes.length} classes/week slots</p>
          </div>
          <div class="tag-list">
            ${!r.active ? `<button class="btn btn-sm" data-action="activate" data-id="${r.id}">Set active</button>` : ""}
            <button class="btn btn-sm" data-action="edit" data-id="${r.id}">Edit</button>
            <button class="btn btn-sm" data-action="duplicate" data-id="${r.id}">Duplicate</button>
            <button class="btn btn-sm btn-danger" data-action="delete" data-id="${r.id}">Delete</button>
          </div>
        </div>
      </div>`).join("");

    listEl.querySelectorAll("[data-action]").forEach((btn) => {
      const id = btn.getAttribute("data-id");
      const action = btn.getAttribute("data-action");
      btn.addEventListener("click", () => {
        if (action === "edit") openEditor(id);
        else if (action === "activate") { Storage.setActiveRoutine(id); App.toast("Routine set as active."); renderList(); }
        else if (action === "duplicate") duplicateRoutine(id);
        else if (action === "delete") confirmDelete(id);
      });
    });
  }

  function confirmDelete(id) {
    const r = Storage.getRoutine(id);
    if (!r) return;
    if (confirm(`Delete routine "${r.name}"? Historical attendance already recorded for it is kept.`)) {
      Storage.deleteRoutine(id);
      App.toast("Routine deleted.");
      renderList();
    }
  }

  function duplicateRoutine(id) {
    const r = Storage.getRoutine(id);
    if (!r) return;
    const copy = {
      ...r,
      id: Storage.genId("rt"),
      name: r.name + " (copy)",
      active: false,
      classes: r.classes.map((c) => ({ ...c, id: Storage.genId("cls") })),
    };
    Storage.upsertRoutine(copy);
    App.toast("Routine duplicated.");
    renderList();
  }

  // ---------- Editor ----------

  function openEditor(id) {
    editingId = id;
    const routine = id ? Storage.getRoutine(id) : null;
    editorTitle.textContent = routine ? "Edit Routine" : "New Routine";
    rName.value = routine ? routine.name : "";
    rStart.value = routine ? routine.startDate : Utils.todayISO();
    rEnd.value = routine && routine.endDate ? routine.endDate : "";
    draftClasses = routine ? routine.classes.map((c) => ({ ...c })) : [];
    deleteBtn.classList.toggle("hidden", !routine);
    pdfStatus.textContent = "";
    pdfInput.value = "";
    renderClassTable();
    backdrop.classList.remove("hidden");
  }

  function closeEditor() {
    backdrop.classList.add("hidden");
  }

  function renderClassTable() {
    if (draftClasses.length === 0) {
      classBody.innerHTML = `<tr><td colspan="8" class="muted">No classes yet — add one, or upload a routine PDF above.</td></tr>`;
      return;
    }
    classBody.innerHTML = draftClasses.map((c, i) => `
      <tr data-idx="${i}">
        <td>
          <select data-field="day">
            ${DAY_OPTIONS.map((d) => `<option value="${d}" ${c.day === d ? "selected" : ""}>${d}</option>`).join("")}
          </select>
        </td>
        <td><input type="time" data-field="startTime" value="${c.startTime || ""}"></td>
        <td><input type="time" data-field="endTime" value="${c.endTime || ""}"></td>
        <td><input type="text" data-field="subject" value="${Utils.escapeHtml(c.subject || "")}" placeholder="Subject"></td>
        <td><input type="text" data-field="code" value="${Utils.escapeHtml(c.code || "")}" placeholder="Code" style="width:5.5rem;"></td>
        <td><input type="text" data-field="room" value="${Utils.escapeHtml(c.room || "")}" placeholder="Room" style="width:4.5rem;"></td>
        <td><input type="text" data-field="faculty" value="${Utils.escapeHtml(c.faculty || "")}" placeholder="Faculty"></td>
        <td>
          <button class="btn btn-sm btn-ghost" data-move="-1" title="Move up">↑</button>
          <button class="btn btn-sm btn-ghost" data-move="1" title="Move down">↓</button>
          <button class="btn btn-sm btn-danger" data-remove title="Delete">✕</button>
        </td>
      </tr>`).join("");

    classBody.querySelectorAll("tr[data-idx]").forEach((tr) => {
      const idx = Number(tr.getAttribute("data-idx"));
      tr.querySelectorAll("[data-field]").forEach((input) => {
        input.addEventListener("change", () => {
          draftClasses[idx][input.getAttribute("data-field")] = input.value;
        });
      });
      const removeBtn = tr.querySelector("[data-remove]");
      removeBtn.addEventListener("click", () => {
        draftClasses.splice(idx, 1);
        renderClassTable();
      });
      tr.querySelectorAll("[data-move]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const dir = Number(btn.getAttribute("data-move"));
          const swapWith = idx + dir;
          if (swapWith < 0 || swapWith >= draftClasses.length) return;
          [draftClasses[idx], draftClasses[swapWith]] = [draftClasses[swapWith], draftClasses[idx]];
          renderClassTable();
        });
      });
    });
  }

  document.getElementById("addClassBtn").addEventListener("click", () => {
    draftClasses.push({
      id: Storage.genId("cls"), day: "Mon", startTime: "", endTime: "",
      subject: "", code: "", room: "", faculty: "",
    });
    renderClassTable();
  });

  document.getElementById("newRoutineBtn").addEventListener("click", () => openEditor(null));
  document.getElementById("closeEditor").addEventListener("click", closeEditor);
  document.getElementById("cancelEditor").addEventListener("click", closeEditor);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeEditor(); });

  deleteBtn.addEventListener("click", () => {
    if (editingId) { confirmDelete(editingId); closeEditor(); }
  });

  document.getElementById("saveRoutineBtn").addEventListener("click", () => {
    const name = rName.value.trim();
    const start = rStart.value;
    if (!name) { App.toast("Give the routine a name."); return; }
    if (!start) { App.toast("Pick a start date."); return; }
    const routine = {
      id: editingId || Storage.genId("rt"),
      name,
      startDate: start,
      endDate: rEnd.value || null,
      active: editingId ? (Storage.getRoutine(editingId)?.active ?? false) : Storage.getRoutines().length === 0,
      classes: draftClasses,
    };
    Storage.upsertRoutine(routine);
    App.toast("Routine saved.");
    closeEditor();
    renderList();
  });

  // ---------- PDF import ----------

  document.getElementById("extractBtn").addEventListener("click", async () => {
    const file = pdfInput.files[0];
    if (!file) { pdfStatus.textContent = "Choose a PDF file first."; return; }
    pdfStatus.textContent = "Reading PDF…";
    try {
      const lines = await PdfParse.extractText(file);
      const rows = PdfParse.parseRows(lines);
      if (rows.length === 0) {
        pdfStatus.textContent = "Couldn't identify any class rows automatically — add classes manually below, or check the PDF has a text layer (not a scanned image).";
        return;
      }
      draftClasses = draftClasses.concat(rows);
      renderClassTable();
      pdfStatus.textContent = `Extracted ${rows.length} possible class${rows.length === 1 ? "" : "es"}. Review every row below — nothing is saved yet.`;
    } catch (err) {
      console.error(err);
      pdfStatus.textContent = "Couldn't read that PDF automatically. Use manual entry below instead.";
    }
  });

  renderList();
})();
