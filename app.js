(() => {
  "use strict";

  const STORAGE_KEY = "ehs-dashboard-chat-v1";

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

  function answerQuestion(qRaw) {
    const q = String(qRaw || "").trim();
    const unknown = data.chat.unknownReply;
    if (!q) return unknown;

    const nq = q.replace(/\s+/g, "");

    // Chip 1: 正育水污效期
    if (
      (nq.includes("正育") && (nq.includes("水污") || nq.includes("水措") || nq.includes("廢水"))) ||
      nq.includes("正育水污效期")
    ) {
      const item = findCert("正育牧場", "water");
      if (item && item.status === "valid") {
        return [
          "【正育牧場｜水污】",
          `證書：${item.name}`,
          `字號：${item.id}`,
          `效期：${item.start}～${item.end}${item.endGregorian ? `（西元 ${item.endGregorian}）` : ""}`,
          item.note ? `備註：${item.note}` : "",
          "狀態：有效",
        ]
          .filter(Boolean)
          .join("\n");
      }
      return unknown;
    }

    // Chip 2: 竹南誰負責消防
    if (nq.includes("竹南") && (nq.includes("消防") || nq.includes("防火"))) {
      const hits = findPersonnel("竹南院區", "消防");
      if (hits.length) {
        return hits
          .map((p) => `【${p.site}｜${p.role}】${p.name}${p.title ? `（${p.title}）` : ""}`)
          .join("\n");
      }
      return unknown;
    }

    // Chip 3: 下次廢污水申報窗口
    if (
      (nq.includes("廢污水") || nq.includes("廢水") || nq.includes("申報")) &&
      (nq.includes("下次") || nq.includes("窗口") || nq.includes("申報") || nq.includes("半年"))
    ) {
      const { calendar, rule } = nextWastewaterWindows();
      const lines = [];
      if (rule) {
        lines.push(`【常設規則】${rule.title}`);
        lines.push(rule.detail);
        lines.push(`適用：${rule.sites}`);
      }
      if (calendar.length) {
        lines.push("");
        lines.push("【近期日曆】");
        calendar.slice(0, 4).forEach((t) => {
          lines.push(`· ${t.title}`);
          lines.push(`  限期 ${t.due}${t.dueRoc ? `（${t.dueRoc}）` : ""}；窗口 ${t.window || "—"}；負責人 ${t.owner}`);
        });
      }
      return lines.length ? lines.join("\n") : unknown;
    }

    // Extra helpful intents
    if (nq.includes("香山") && nq.includes("消防")) {
      const hits = findPersonnel("香山院本部", "消防");
      if (hits.length) {
        return hits
          .map((p) => `【${p.site}｜${p.role}】${p.name}${p.title ? `（${p.title}）` : ""}`)
          .join("\n");
      }
    }

    if (nq.includes("香山") && (nq.includes("管制藥品") || nq.includes("管證"))) {
      const item = findCert("香山院本部", "controlled");
      if (item && item.status === "valid") {
        return [
          "【香山院本部｜管制藥品】",
          `證書：${item.name}`,
          `字號：${item.id}`,
          item.manager ? `管理人：${item.manager}` : "",
          item.address ? `地址：${item.address}` : "",
          item.note || "有效",
        ]
          .filter(Boolean)
          .join("\n");
      }
    }

    if (nq.includes("召集人") || nq.includes("執行秘書")) {
      return (data.leadership || [])
        .map((p) => `【${p.role}】${p.name}${p.title ? `（${p.title}）` : ""}`)
        .join("\n") || unknown;
    }

    return unknown;
  }

  function appendMsg(role, text) {
    const box = $("#chat-messages");
    const div = document.createElement("div");
    div.className = `msg msg-${role}`;
    div.textContent = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function loadTranscript() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveTranscript(msgs) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-40)));
    } catch {
      /* ignore quota */
    }
  }

  const LIVE_CFG_KEY = "ehs-dashboard-live-cfg-v1";
  const OUTBOX_URL = "data/chat-outbox.json";
  const pendingLive = new Map(); // id -> { question, timer }
  let pollTimer = null;

  function loadLiveCfg() {
    try {
      const raw = localStorage.getItem(LIVE_CFG_KEY);
      if (!raw) return { enabled: false, url: "", key: "" };
      const o = JSON.parse(raw);
      return {
        enabled: !!o.enabled,
        url: String(o.url || ""),
        key: String(o.key || ""),
      };
    } catch {
      return { enabled: false, url: "", key: "" };
    }
  }

  function saveLiveCfg(cfg) {
    localStorage.setItem(LIVE_CFG_KEY, JSON.stringify(cfg));
  }

  function updateModeHint() {
    const hint = $("#chat-mode-hint");
    if (!hint) return;
    const cfg = loadLiveCfg();
    if (cfg.enabled && cfg.url && cfg.key) {
      hint.textContent = "即時模式：問題會同步到 Grok Bot，回覆寫回後約數秒顯示。";
    } else if (cfg.enabled) {
      hint.textContent = "已開即時同步，但尚未設定 Webhook（按「設定」貼上網址與金鑰）。";
    } else {
      hint.textContent = "預設依看板資料回覆；開啟即時同步後會送到 Grok Bot。";
    }
  }

  function newQuestionId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `q-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function postWebhook(payload) {
    const cfg = loadLiveCfg();
    if (!cfg.url || !cfg.key) throw new Error("尚未設定 Webhook");
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.key}`,
      "X-Webhook-Key": cfg.key,
    };
    const res = await fetch(cfg.url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      mode: "cors",
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Webhook HTTP ${res.status}${t ? `: ${t.slice(0, 120)}` : ""}`);
    }
  }

  async function pollOutboxOnce() {
    if (!pendingLive.size) return;
    try {
      const res = await fetch(`${OUTBOX_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const list = await res.json();
      if (!Array.isArray(list)) return;
      for (const row of list) {
        if (!row || !row.id || pendingLive.has(row.id) === false) continue;
        if (!row.answer) continue;
        const meta = pendingLive.get(row.id);
        pendingLive.delete(row.id);
        if (meta && meta.el) meta.el.remove();
        appendMsg("bot", row.answer);
        const transcript = loadTranscript();
        transcript.push({ role: "user", text: row.question || meta?.question || "" }, { role: "bot", text: row.answer });
        saveTranscript(transcript);
      }
      if (!pendingLive.size && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    } catch {
      /* ignore transient */
    }
  }

  function ensurePoll() {
    if (pollTimer) return;
    pollTimer = setInterval(pollOutboxOnce, 2500);
    pollOutboxOnce();
  }

  async function askLive(question) {
    const id = newQuestionId();
    appendMsg("user", question);
    const pending = document.createElement("div");
    pending.className = "msg msg-bot msg-pending";
    pending.textContent = "已送出，等待「測試、構思執行者」回覆…";
    $("#chat-messages").appendChild(pending);
    $("#chat-messages").scrollTop = $("#chat-messages").scrollHeight;
    pendingLive.set(id, { question, el: pending });
    ensurePoll();
    try {
      await postWebhook({
        id,
        question,
        text: question,
        message: question,
        ts: new Date().toISOString(),
        source: "atri-ehs-dashboard",
      });
    } catch (err) {
      pendingLive.delete(id);
      pending.remove();
      const local = answerQuestion(question);
      appendMsg(
        "bot",
        `即時同步失敗（${err.message || err}）。改以看板資料回覆：\n${local}`
      );
      const transcript = loadTranscript();
      transcript.push({ role: "user", text: question }, { role: "bot", text: local });
      saveTranscript(transcript);
    }
  }

  function ask(q) {
    const question = String(q || "").trim();
    if (!question) return;
    const cfg = loadLiveCfg();
    if (cfg.enabled && cfg.url && cfg.key) {
      askLive(question);
      return;
    }
    appendMsg("user", question);
    const reply = answerQuestion(question);
    appendMsg("bot", reply);
    const transcript = loadTranscript();
    transcript.push({ role: "user", text: question }, { role: "bot", text: reply });
    saveTranscript(transcript);
  }

  function setupChat() {
    const chat = data.chat || {};
    $("#chat-title").textContent = chat.title || "提問「測試、構思執行者」";
    $("#chat-input").placeholder = chat.placeholder || "輸入問題…";

    const cfg = loadLiveCfg();
    const enabled = $("#chat-live-enabled");
    const settings = $("#chat-settings");
    const urlInput = $("#chat-webhook-url");
    const keyInput = $("#chat-webhook-key");
    if (enabled) enabled.checked = !!cfg.enabled;
    if (urlInput) urlInput.value = cfg.url || "";
    if (keyInput) keyInput.value = cfg.key || "";
    updateModeHint();

    enabled?.addEventListener("change", () => {
      const next = loadLiveCfg();
      next.enabled = enabled.checked;
      saveLiveCfg(next);
      updateModeHint();
      if (next.enabled && !(next.url && next.key) && settings) {
        settings.hidden = false;
      }
    });

    $("#chat-settings-btn")?.addEventListener("click", () => {
      if (!settings) return;
      settings.hidden = !settings.hidden;
    });

    $("#chat-settings-save")?.addEventListener("click", () => {
      const next = {
        enabled: !!(enabled && enabled.checked),
        url: (urlInput?.value || "").trim(),
        key: (keyInput?.value || "").trim(),
      };
      saveLiveCfg(next);
      const st = $("#chat-settings-status");
      if (st) st.textContent = next.url && next.key ? "已儲存連線設定（僅本機）。" : "請同時填寫 URL 與 key。";
      updateModeHint();
    });

    const chips = $("#chat-chips");
    chips.innerHTML = (chat.suggestedChips || [])
      .map((c) => `<button type="button" class="chip" data-q="${escapeHtml(c)}">${escapeHtml(c)}</button>`)
      .join("");

    chips.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      ask(btn.dataset.q || btn.textContent);
    });

    $("#chat-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("#chat-input");
      const q = input.value;
      input.value = "";
      ask(q);
    });

    const transcript = loadTranscript();
    if (transcript.length) {
      transcript.forEach((m) => appendMsg(m.role === "user" ? "user" : "bot", m.text));
    } else {
      appendMsg(
        "bot",
        "您好，我是「測試、構思執行者」看板助手。可先點建議問題；若要即時同步到 Grok Bot，請開啟上方開關並完成 Webhook 設定。"
      );
    }

    const panel = $("#chat-panel");
    const toggle = $("#chat-toggle");
    const fab = $("#chat-fab");

    function setCollapsed(collapsed) {
      panel.classList.toggle("collapsed", collapsed);
      toggle.setAttribute("aria-expanded", String(!collapsed));
      if (fab) fab.hidden = !collapsed || window.matchMedia("(max-width: 1099px)").matches;
    }

    toggle.addEventListener("click", () => {
      setCollapsed(!panel.classList.contains("collapsed"));
    });

    if (fab) {
      fab.addEventListener("click", () => setCollapsed(false));
    }

    if (window.matchMedia("(max-width: 1099px)").matches) {
      setCollapsed(true);
    } else {
      setCollapsed(false);
    }
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
      setupChat();
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
