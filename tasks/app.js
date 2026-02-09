// ============================================
//  TASK BOARD RENDERER
//  Reads PEOPLE, CLIENTS, TASKS from tasks.js
// ============================================

(function () {
  const board = document.getElementById("board");
  const statsEl = document.getElementById("taskStats");

  // Group tasks by person
  const tasksByPerson = {};
  for (const key of Object.keys(PEOPLE)) {
    tasksByPerson[key] = { todo: [], done: [] };
  }
  for (const task of TASKS) {
    if (!tasksByPerson[task.person]) continue;
    if (task.status === "done") {
      tasksByPerson[task.person].done.push(task);
    } else {
      tasksByPerson[task.person].todo.push(task);
    }
  }

  // Stats
  const total = TASKS.length;
  const done = TASKS.filter((t) => t.status === "done").length;
  const todo = total - done;
  statsEl.textContent = `${todo} to do \u00b7 ${done} done`;

  // Render columns
  for (const [personKey, person] of Object.entries(PEOPLE)) {
    const groups = tasksByPerson[personKey];
    const col = document.createElement("div");
    col.className = "column";

    col.innerHTML = `
      <div class="column__header">
        <div class="column__person">
          <span class="column__name" style="color: ${person.color};">${person.name}</span>
        </div>
        <div class="column__tabs">
          <button class="column__tab column__tab--active" data-tab="todo" style="--tab-color: ${person.color};">to do <span class="tab__count">${groups.todo.length}</span></button>
          <button class="column__tab" data-tab="done" style="--tab-color: ${person.color};">done <span class="tab__count">${groups.done.length}</span></button>
        </div>
      </div>
      <div class="column__body">
        <div class="column__panel column__panel--active" data-panel="todo">
          ${groups.todo.length ? groups.todo.map((t, i) => renderTask(t, i + 1)).join("") : '<div class="section__empty">no tasks</div>'}
        </div>
        <div class="column__panel" data-panel="done">
          ${groups.done.length ? groups.done.map((t, i) => renderTask(t, i + 1)).join("") : '<div class="section__empty">nothing yet</div>'}
        </div>
      </div>
    `;

    // Tab switching
    const tabs = col.querySelectorAll(".column__tab");
    const panels = col.querySelectorAll(".column__panel");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("column__tab--active"));
        panels.forEach((p) => p.classList.remove("column__panel--active"));
        tab.classList.add("column__tab--active");
        col.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add("column__panel--active");
      });
    });

    board.appendChild(col);
  }

  function formatDue(dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function renderTask(task, num) {
    const person = PEOPLE[task.person];
    let desc = "";
    if (task.description) {
      desc = `<p class="task__desc">${task.description}</p>`;
    }

    let due = "";
    if (task.due) {
      due = `<span class="task__due" style="color: ${person.color};">${formatDue(task.due)}</span>`;
    }

    let docLink = "";
    if (task.doc) {
      docLink = `<a href="${task.doc}" target="_blank" class="task__doc" title="View source document"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`;
    }

    return `
      <div class="task">
        <span class="task__num" style="color: ${person.color};">${num}</span>
        <div class="task__body">
          <span class="task__title">${task.title}</span>
          ${desc}
          ${due}
        </div>
        ${docLink}
      </div>
    `;
  }
})();
