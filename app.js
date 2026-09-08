(() => {
  "use strict";


  const GATE_HASH = "4e36e66055c67d34bcb90241a74f64e6233760bfc7cfc5ec4df5eeea6eb35728";
  const GATE_SESSION_KEY = "ehs-dashboard-gate-v1";

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(text)
    );
    return [...new Uint8Array(buf)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function unlockGate() {
    document.body.classList.remove("locked");
    const overlay = $("#gate-overlay");
    if (overlay) overlay.remove();
  }

  async function setupGate() {
    if (sessionStorage.getItem(GATE_SESSION_KEY) === GATE_HASH) {
      unlockGate();
      return true;
    }
    const form = $("#gate-form");
    const input = $("#gate-password");
    const err = $("#gate-error");
    if (!form || !input) {
      unlockGate();
      return true;
    }
    return new Promise((resolve) => {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const hash = await sha256Hex(input.value);
        if (hash === GATE_HASH) {
          sessionStorage.setItem(GATE_SESSION_KEY, GATE_HASH);
          if (err) err.hidden = true;
          unlockGate();
          resolve(true);
        } else {
          if (err) err.hidden = false;
          input.value = "";
          input.focus();
        }
      });
    });
  }

  let data = null;

  const $ = (sel, root = document) => root.querySelector(sel);

  async function loadData() {
    const res = await fetch("data/dashboard.json", { cache: "no-store" });
    if (!res.ok) throw new Error("無法載入 dashboard.json");
    return res.json();
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statusBadge(status) {
    if (status === "valid") return '<span class="badge badge-valid">有效</span>';
    if (status === "notApplicable") return '<span class="badge badge-nap">—</span>';
    return '<span class="badge badge-na">NA</span>';
  }

  function priorityBadge(p) {
    if (p === "high") return '<span class="badge badge-high">高</span>';
    if (p === "medium") return '<span class="badge badge-medium">中</span>';
    return '<span class="badge badge-nap">一般</span>';
  }

  function renderHeader() {
    const m = data.meta;
    document.title = `${m.title}｜${m.subtitle}`;
    $("#header-updated").textContent = m.updatedLabel;
    $("#header-org").textContent = `${m.org} · ${m.team}`;
    $("#site-footer").textContent = m.footer;
    $("#personnel-source").textContent = m.sourceNote;
  }

  function renderPersonnel() {
    const grid = $("#personnel-grid");
    const all = [...(data.leadership || []), ...(data.personnel || [])];
    grid.innerHTML = all
      .map((p) => {
        const vacant = p.status === "vacant";
        const title = p.title ? `<div class="person-role" style="margin-top:0;opacity:.85">${escapeHtml(p.title)}</div>` : "";
        return `
          <article class="person-card ${vacant ? "vacant" : ""}">
            <div class="person-site">${escapeHtml(p.site)}</div>
            <p class="person-role">${escapeHtml(p.role)}</p>
            <p class="person-name">${escapeHtml(p.name)}</p>
            ${title}
          </article>`;
      })
      .join("");

    const notes = $("#personnel-notes");
    notes.innerHTML = (data.personnelNotes || [])
      .map((n) => `<li>${escapeHtml(n)}</li>`)
      .join("");
  }

  function renderLegend() {
    const el = $("#cert-legend");
    el.innerHTML = (data.legend || [])
      .map((L) => {
        const cls =
          L.key === "valid" ? "badge-valid" : L.key === "notApplicable" ? "badge-nap" : "badge-na";
        return `<span class="legend-item" role="listitem"><span class="badge ${cls}">${escapeHtml(L.symbol)}</span>${escapeHtml(L.label)}</span>`;
      })
      .join("");
  }

  function renderCertMatrix() {
    const cats = data.certificateCategories || [];
    const thead = $("#cert-matrix thead");
    const tbody = $("#cert-matrix tbody");

    thead.innerHTML = `<tr>
      <th class="site-col">場域</th>
      ${cats.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}
    </tr>`;

    tbody.innerHTML = (data.certificates || [])
      .map((row) => {
        const cells = cats
          .map((c) => {
            const item = row.items[c.id] || { status: "na" };
            return `<td>${statusBadge(item.status)}</td>`;
          })
          .join("");
        return `<tr><td class="site-col">${escapeHtml(row.site)}</td>${cells}</tr>`;
      })
      .join("");

    const details = $("#cert-details");
    details.innerHTML = (data.certificates || [])
      .map((row) => {
        const lines = cats
          .map((c) => {
            const item = row.items[c.id];
            if (!item || item.status === "notApplicable") return "";
            if (item.status === "na") {
              return `<div class="cert-item"><strong>${escapeHtml(c.label)}</strong>：NA${item.note ? `（${escapeHtml(item.note)}）` : ""}</div>`;
            }
            const bits = [
              item.name && escapeHtml(item.name),
              item.id && escapeHtml(item.id),
              item.start && item.end && `效期 ${escapeHtml(item.start)}～${escapeHtml(item.end)}`,
              item.start && !item.end && `核發／本件 ${escapeHtml(item.start)}`,
              item.endGregorian && `（西元 ${escapeHtml(item.endGregorian)}）`,
              item.manager && `管理人：${escapeHtml(item.manager)}`,
              item.address && `地址：${escapeHtml(item.address)}`,
              item.note && escapeHtml(item.note),
            ].filter(Boolean);
            return `<div class="cert-item"><strong>${escapeHtml(c.label)}</strong>：${statusBadge("valid")} ${bits.join(" · ")}</div>`;
          })
          .filter(Boolean)
          .join("");

        const footnotes =
          row.footnotes && row.footnotes.length
            ? `<ul class="footnotes">${row.footnotes.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>`
            : "";

        if (!lines && !footnotes) return "";
        return `<article class="cert-detail-card"><h3>${escapeHtml(row.site)}</h3>${lines}${footnotes}</article>`;
      })
      .filter(Boolean)
      .join("");
  }

  function renderTodos() {
    const standing = $("#standing-rules");
    standing.innerHTML = (data.todoStandingRules || [])
      .map(
        (r) => `
        <article class="rule-card">
          <h3>${escapeHtml(r.title)} ${priorityBadge(r.priority)} <span class="badge badge-nap">常設規則</span></h3>
          <p>${escapeHtml(r.detail)}</p>
          <p><strong>適用：</strong>${escapeHtml(r.sites)}</p>
        </article>`
      )
      .join("");

    const list = $("#todo-list");
    const todos = [...(data.todos || [])].sort((a, b) => String(a.due).localeCompare(String(b.due)));

    if (!todos.length) {
      list.innerHTML = `<p class="empty-note">${escapeHtml(data.todoEmptyNote || "日曆近期尚無額外排程（或待同步）")}</p>`;
      return;
    }

    list.innerHTML = todos
      .map(
        (t) => `
        <article class="todo-card priority-${escapeHtml(t.priority || "medium")}">
          <div class="todo-top">
            <h3 class="todo-title">${escapeHtml(t.title)}</h3>
            ${priorityBadge(t.priority)}
          </div>
          <p class="todo-detail">${escapeHtml(t.detail || "")}</p>
          <div class="todo-meta">
            <span><strong>限期</strong> ${escapeHtml(t.due)}${t.dueRoc ? `（${escapeHtml(t.dueRoc)}）` : ""}</span>
            ${t.window ? `<span><strong>窗口</strong> ${escapeHtml(t.window)}</span>` : ""}
            <span><strong>負責人</strong> ${escapeHtml(t.owner)}</span>
            <span><strong>場域</strong> ${escapeHtml(t.site)}</span>
          </div>
        </article>`
      )
      .join("");
  }

  function renderRegs() {
    const list = $("#reg-list");
    const regs = [...(data.regulations || [])].sort((a, b) =>
      String(b.dateSort || b.date).localeCompare(String(a.dateSort || a.date))
    );
    list.innerHTML = regs
      .map(
        (r) => `
        <article class="reg-card">
          <div class="reg-code">${escapeHtml(r.code || "—")}</div>
          <div>
            <h3 class="reg-title">${escapeHtml(r.title)}</h3>
            ${r.note ? `<p class="reg-note">${escapeHtml(r.note)}</p>` : ""}
          </div>
          <div class="reg-date">
            <span class="action">${escapeHtml(r.action || "修正")}</span>
            ${escapeHtml(r.date)}
            ${r.dateGregorian ? `<br /><span>${escapeHtml(r.dateGregorian)}</span>` : ""}
          </div>
        </article>`
      )
      .join("");
  }

  /* ---------- Chat (client-side over JSON) ---------- */

  function findCert(siteName, catId) {
    const row = (data.certificates || []).find((c) => c.site === siteName);
    if (!row) return null;
    return row.items[catId] || null;
  }

  function findPersonnel(siteHint, roleHint) {
    const all = [...(data.leadership || []), ...(data.personnel || [])];
    return all.filter((p) => {
      const siteOk = !siteHint || p.site.includes(siteHint);
      const roleOk = !roleHint || p.role.includes(roleHint);
      return siteOk && roleOk;
    });
  }

  function nextWastewaterWindows() {
    const calendar = (data.todos || [])
      .filter((t) => t.title.includes("廢污水半年申報"))
      .sort((a, b) => String(a.due).localeCompare(String(b.due)));
    const rule = (data.todoStandingRules || []).find((r) => r.id === "wastewater-semi-annual");
    return { calendar, rule };
  }

  async function init() {
    try {
      await setupGate();
      data = await loadData();
      renderHeader();
      renderPersonnel();
      renderLegend();
      renderCertMatrix();
      renderTodos();
      renderRegs();
    } catch (err) {
      console.error(err);
      document.body.insertAdjacentHTML(
        "afterbegin",
        `<div style="margin:1rem;padding:1rem;background:#fee2e2;border-radius:8px;color:#991b1b">
          無法載入看板資料。請以本機伺服器開啟（勿直接用 file://）：<br />
          <code>cd /workspace/ehs-dashboard && python3 -m http.server 8765</code>
        </div>`
      );
    }
  }

  init();
})();
