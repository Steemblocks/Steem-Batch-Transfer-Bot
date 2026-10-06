// ============================================================
//  app.js  –  Steem Batch Transfer Web UI — Frontend Logic
//  Single-page app: clean URLs (/, /history, /report, /settings)
//  handled by a tiny History-API router — no page reloads.
// ============================================================

(function () {
  "use strict";

  // ── DOM helpers ─────────────────────────────────────────────

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const show = (el, visible = true) => { if (el) el.hidden = !visible; };
  const hide = (el) => show(el, false);

  // Escapes text for safe use in HTML text AND attribute values.
  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function api(url, options = {}) {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Server returned an invalid response (${res.status}).`);
    }
    if (!res.ok || (data && data.error)) {
      throw new Error((data && data.error) || `Request failed (${res.status}).`);
    }
    return data;
  }

  // ── Toast Notifications ────────────────────────────────────

  const toastContainer = $("#toastContainer");

  function toast(message, type = "info") {
    const icons = { success: "✔", error: "✖", info: "ℹ" };
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;

    const icon = document.createElement("span");
    icon.className = "toast-icon";
    icon.textContent = icons[type] || icons.info;
    const text = document.createElement("span");
    text.textContent = message; // textContent: never interpret server messages as HTML

    el.append(icon, text);
    toastContainer.appendChild(el);

    setTimeout(() => {
      el.classList.add("toast-out");
      el.addEventListener("animationend", () => el.remove(), { once: true });
    }, 3500);
  }

  // ── Router ─────────────────────────────────────────────────

  const navTrack = $("#navTrack");
  const navIndicator = $("#navIndicator");
  const navLinks = $$(".nav-link");
  const views = $$(".view");

  const APP_NAME = "Steem Batch Transfer";

  const ROUTES = {
    "/": { title: "Recipients" },
    // Votes are fetched only when the user clicks "Load Votes" / "Refresh"
    "/history": { title: "Vote History" },
    "/report": { title: "Report" },
    "/settings": { title: "Settings" },
  };

  let currentPath = null;

  function normalizePath(pathname) {
    const p = (pathname || "/").replace(/\/+$/, "") || "/";
    return Object.prototype.hasOwnProperty.call(ROUTES, p) ? p : null;
  }

  function moveIndicator(animate = true) {
    const active = navTrack.querySelector(".nav-link.active");
    if (!active) return;
    navIndicator.style.transition = animate ? "" : "none";
    navIndicator.style.width = `${active.offsetWidth}px`;
    navIndicator.style.transform = `translateX(${active.offsetLeft}px)`;
    navIndicator.classList.add("ready");
  }

  function render(path) {
    const isFirstRender = currentPath === null;
    currentPath = path;
    const route = ROUTES[path];

    views.forEach((v) => {
      const active = v.dataset.view === path;
      v.hidden = !active;
      v.classList.toggle("is-active", active);
    });

    navLinks.forEach((link) => {
      const active = link.dataset.route === path;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });

    document.title = `${route.title} · ${APP_NAME}`;
    moveIndicator(!isFirstRender);
    if (!isFirstRender) window.scrollTo({ top: 0 });
    if (route.onEnter) route.onEnter();
  }

  function navigate(path, { replace = false } = {}) {
    const target = normalizePath(path) || "/";
    if (target === currentPath) return;
    history[replace ? "replaceState" : "pushState"]({}, "", target);
    render(target);
  }

  // Intercept in-app links (keeps Ctrl/Cmd-click → new tab working).
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a[data-link]");
    if (!link) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(link.getAttribute("href"));
  });

  window.addEventListener("popstate", () => {
    render(normalizePath(location.pathname) || "/");
  });

  window.addEventListener("resize", () => moveIndicator(false));

  // ── Account / Navbar chip ──────────────────────────────────

  const accountChip = $("#accountChip");
  const accountName = $("#accountName");

  let account = { sender: "", hasKey: false, keyHint: "", trackAccount: "", rpcNodes: [] };

  function renderAccountChip() {
    accountChip.classList.remove("is-loading", "is-ready", "is-warning");
    if (account.sender && account.hasKey) {
      accountChip.classList.add("is-ready");
      accountName.textContent = `@${account.sender}`;
      accountChip.title = `Sending as @${account.sender} — open settings`;
    } else {
      accountChip.classList.add("is-warning");
      accountName.textContent = account.sender ? "Key missing" : "Set up account";
      accountChip.title = "Account not fully configured — open settings";
    }
    // Chip width can change → nav may shift on mid-size screens
    requestAnimationFrame(() => moveIndicator(false));
  }

  // ── Recipients Table ───────────────────────────────────────

  const recipientsTbody = $("#recipientsTbody");
  const emptyState = $("#emptyState");
  const totalAmount = $("#totalAmount");
  const totalCount = $("#totalCount");
  const btnAddRecipient = $("#btnAddRecipient");
  const btnSaveRecipients = $("#btnSaveRecipients");
  const btnTransfer = $("#btnTransfer");
  const navDirtyDot = $("#navDirtyDot");

  let recipients = [];
  let recipientsDirty = false;

  function setDirty(dirty) {
    recipientsDirty = dirty;
    btnSaveRecipients.classList.toggle("has-changes", dirty);
    btnSaveRecipients.disabled = !dirty;
    show(navDirtyDot, dirty);
  }

  function renderRecipients() {
    emptyState.classList.toggle("visible", recipients.length === 0);

    recipientsTbody.innerHTML = recipients
      .map(
        (r, index) => `
        <tr>
          <td>${index + 1}</td>
          <td><input type="text" value="${esc(r.to)}" placeholder="username" data-field="to" data-index="${index}" spellcheck="false" autocomplete="off" aria-label="Account for row ${index + 1}" /></td>
          <td><input type="text" inputmode="decimal" class="input-amount" value="${esc(r.amount)}" placeholder="0.000" data-field="amount" data-index="${index}" spellcheck="false" autocomplete="off" aria-label="Amount for row ${index + 1}" /></td>
          <td><input type="text" value="${esc(r.memo)}" placeholder="Optional memo" data-field="memo" data-index="${index}" spellcheck="false" autocomplete="off" aria-label="Memo for row ${index + 1}" /></td>
          <td>
            <button type="button" class="btn-danger-ghost btn-remove" data-index="${index}" title="Remove row" aria-label="Remove row ${index + 1}">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </td>
        </tr>`
      )
      .join("");

    updateTotals();
  }

  // Event delegation — bound once, survives re-renders.
  recipientsTbody.addEventListener("input", (e) => {
    const inp = e.target.closest("input[data-field]");
    if (!inp) return;
    const idx = parseInt(inp.dataset.index, 10);
    recipients[idx][inp.dataset.field] = inp.value;
    setDirty(true);
    updateTotals();
  });

  recipientsTbody.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-remove");
    if (!btn) return;
    recipients.splice(parseInt(btn.dataset.index, 10), 1);
    setDirty(true);
    renderRecipients();
  });

  function updateTotals() {
    let total = 0;
    let count = 0;
    for (const r of recipients) {
      const amt = parseFloat(r.amount);
      if (!isNaN(amt) && amt > 0) {
        total = (Math.round(total * 1000) + Math.round(amt * 1000)) / 1000;
        count++;
      }
    }
    totalAmount.textContent = total.toFixed(3);
    totalCount.textContent = count;
  }

  btnAddRecipient.addEventListener("click", () => {
    recipients.push({ to: "", amount: "", memo: "" });
    setDirty(true);
    renderRecipients();
    // Focus the new row's first input
    const input = $("tr:last-child input", recipientsTbody);
    if (input) input.focus();
  });

  // ── Save Recipients ────────────────────────────────────────

  // Returns true on success. Used by the Save button and before transfers.
  async function saveRecipients({ silent = false } = {}) {
    // Filter out completely empty rows
    const toSave = recipients.filter((r) => String(r.to).trim() || String(r.amount).trim());

    if (toSave.length === 0) {
      toast("Nothing to save. Add at least one recipient.", "error");
      return false;
    }

    // Validate
    for (const [i, r] of toSave.entries()) {
      if (!String(r.to).trim()) {
        toast(`Row ${i + 1}: Username is empty.`, "error");
        return false;
      }
      if (!String(r.amount).trim()) {
        toast(`Row ${i + 1}: Amount is missing.`, "error");
        return false;
      }
      const amt = parseFloat(r.amount);
      if (isNaN(amt) || amt < 0) {
        toast(`Row ${i + 1}: Invalid amount "${r.amount}".`, "error");
        return false;
      }
    }

    // Normalize amounts
    const normalized = toSave.map((r) => ({
      to: String(r.to).trim().replace(/^@/, "").toLowerCase(),
      amount: parseFloat(r.amount).toFixed(3),
      memo: String(r.memo || "").trim(),
    }));

    btnSaveRecipients.classList.add("loading");
    try {
      await api("/api/recipients", { method: "POST", body: JSON.stringify(normalized) });
      recipients = normalized;
      renderRecipients();
      setDirty(false);
      if (!silent) toast("Recipients saved successfully!", "success");
      return true;
    } catch (err) {
      toast(`Save failed: ${err.message}`, "error");
      return false;
    } finally {
      btnSaveRecipients.classList.remove("loading");
    }
  }

  btnSaveRecipients.addEventListener("click", () => saveRecipients());

  async function loadRecipients() {
    try {
      const data = await api("/api/recipients");
      if (Array.isArray(data)) {
        recipients = data;
        renderRecipients();
        setDirty(false);
      }
    } catch (err) {
      toast(`Failed to load recipients: ${err.message}`, "error");
      renderRecipients();
    }
  }

  // ── Settings ───────────────────────────────────────────────

  const inputSender = $("#inputSender");
  const inputKey = $("#inputKey");
  const inputTrackAccount = $("#inputTrackAccount");
  const keyHint = $("#keyHint");
  const keyStatus = $("#keyStatus");
  const btnToggleKey = $("#btnToggleKey");
  const nodesContainer = $("#nodesContainer");
  const btnAddNode = $("#btnAddNode");
  const btnSaveSettings = $("#btnSaveSettings");
  const settingsForm = $("#settingsForm");

  let rpcNodes = [];
  let settingsDirty = false;

  function setSettingsDirty(dirty) {
    settingsDirty = dirty;
    btnSaveSettings.disabled = !dirty;
  }

  settingsForm.addEventListener("input", () => {
    setSettingsDirty(true);
  });

  function renderNodes() {
    nodesContainer.innerHTML = rpcNodes
      .map(
        (url, i) => `
        <div class="node-row">
          <span class="node-num">${i + 1}</span>
          <input type="text" value="${esc(url)}" placeholder="https://api.example.com" data-node-index="${i}" spellcheck="false" autocomplete="off" aria-label="RPC node ${i + 1}" />
          <button type="button" class="btn-danger-ghost btn-remove-node" data-node-index="${i}" title="Remove node" aria-label="Remove node ${i + 1}">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>`
      )
      .join("");
  }

  nodesContainer.addEventListener("input", (e) => {
    const inp = e.target.closest("input[data-node-index]");
    if (inp) rpcNodes[parseInt(inp.dataset.nodeIndex, 10)] = inp.value;
  });

  nodesContainer.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-remove-node");
    if (!btn) return;
    rpcNodes.splice(parseInt(btn.dataset.nodeIndex, 10), 1);
    setSettingsDirty(true);
    renderNodes();
  });

  btnAddNode.addEventListener("click", () => {
    rpcNodes.push("");
    setSettingsDirty(true);
    renderNodes();
    const input = $(".node-row:last-child input", nodesContainer);
    if (input) input.focus();
  });

  // Toggle key visibility
  btnToggleKey.addEventListener("click", () => {
    inputKey.type = inputKey.type === "password" ? "text" : "password";
  });

  function renderSettingsForm() {
    inputSender.value = account.sender || "";
    inputKey.value = "";
    inputKey.type = "password";
    if (account.hasKey) {
      inputKey.placeholder = "Leave blank to keep the saved key";
      keyHint.textContent = `A key is saved (${account.keyHint}). Enter a new one only to replace it.`;
      show(keyStatus);
    } else {
      inputKey.placeholder = "5J________________________________";
      keyHint.textContent = "Your active private key.";
      hide(keyStatus);
    }
    rpcNodes = (account.rpcNodes || []).slice();
    renderNodes();
    inputTrackAccount.value = account.trackAccount || "";
    setSettingsDirty(false);
  }

  async function saveSettings() {
    const sender = inputSender.value.trim().replace(/^@/, "");
    const activeKey = inputKey.value.trim();
    const trackAccount = inputTrackAccount.value.trim().replace(/^@/, "");
    const nodes = rpcNodes.map((n) => n.trim()).filter(Boolean);

    if (!sender) {
      toast("Please enter your Steem username.", "error");
      inputSender.focus();
      return;
    }
    if (!activeKey && !account.hasKey) {
      toast("Please enter your active key.", "error");
      inputKey.focus();
      return;
    }
    if (nodes.length === 0) {
      toast("Please add at least one RPC node.", "error");
      return;
    }

    const senderChanged = sender.toLowerCase() !== (account.sender || "").toLowerCase();
    const trackChanged = trackAccount.toLowerCase() !== (account.trackAccount || "").toLowerCase();

    btnSaveSettings.classList.add("loading");
    try {
      await api("/api/config", {
        method: "POST",
        body: JSON.stringify({ sender, activeKey, trackAccount, rpcNodes: nodes }),
      });
      await loadAccount();
      if (trackChanged) resetVotes();
      toast("Settings saved successfully!", "success");
      setSettingsDirty(false);
    } catch (err) {
      toast(`Save failed: ${err.message}`, "error");
    } finally {
      btnSaveSettings.classList.remove("loading");
    }
  }

  btnSaveSettings.addEventListener("click", saveSettings);
  settingsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveSettings();
  });

  async function loadAccount() {
    try {
      account = await api("/api/config");
    } catch (err) {
      toast(`Failed to load settings: ${err.message}`, "error");
    }
    renderAccountChip();
    renderSettingsForm();
  }

  // ── Transfer Execution ─────────────────────────────────────

  const transferModal = $("#transferModal");
  const progressBar = $("#progressBar");
  const progressLabel = $("#progressLabel");
  const transferResults = $("#transferResults");
  const summaryBar = $("#summaryBar");
  const summSuccess = $("#summSuccess");
  const summFail = $("#summFail");
  const summSkip = $("#summSkip");
  const btnCloseModal = $("#btnCloseModal");
  const btnDoneModal = $("#btnDoneModal");

  let transferInProgress = false;

  btnTransfer.addEventListener("click", async () => {
    if (!account.sender || !account.hasKey) {
      toast("Set up your account in Settings before sending.", "error");
      navigate("/settings");
      return;
    }

    // Quick validation
    const validRecipients = recipients.filter((r) => String(r.to).trim() && String(r.amount).trim());
    if (validRecipients.length === 0) {
      toast("No recipients to transfer to. Add recipients first.", "error");
      return;
    }

    // The server sends from recipients.txt — persist edits first so what you
    // see is exactly what gets sent.
    if (recipientsDirty) {
      const ok = await saveRecipients({ silent: true });
      if (!ok) return;
    }

    // Confirm
    const totalSteem = recipients.reduce((sum, r) => {
      const amt = parseFloat(r.amount);
      return isNaN(amt) ? sum : (Math.round(sum * 1000) + Math.round(amt * 1000)) / 1000;
    }, 0);

    const rows = validRecipients
      .map((r) => {
        const amt = parseFloat(r.amount);
        return `<div class="confirm-row"><span class="cr-to">@${esc(String(r.to).trim())}</span>` +
          `<span class="cr-amt">${isNaN(amt) ? esc(r.amount) : amt.toFixed(3)} STEEM</span></div>`;
      })
      .join("");

    const confirmed = await confirmDialog({
      title: "Confirm Transfer",
      message: `Send <strong>${totalSteem.toFixed(3)} STEEM</strong> to <strong>${recipients.length}</strong> recipient(s) from <strong>@${esc(account.sender)}</strong>?`,
      detailsHtml: rows +
        `<div class="confirm-row confirm-total"><span class="cr-to">Total</span><span class="cr-amt">${totalSteem.toFixed(3)} STEEM</span></div>`,
      confirmText: "Send Transfers",
    });
    if (!confirmed) return;

    // Open modal
    openModal();
    progressBar.style.width = "0%";
    progressBar.classList.remove("is-error");
    progressBar.classList.add("is-indeterminate");
    progressLabel.textContent = "Sending transfers… keep this tab open.";
    transferResults.innerHTML = "";
    hide(summaryBar);
    hide(btnDoneModal);
    btnTransfer.disabled = true;
    transferInProgress = true;
    btnCloseModal.disabled = true;

    try {
      let data;
      try {
        data = await api("/api/transfer", { method: "POST" });
      } catch (err) {
        progressBar.classList.remove("is-indeterminate");
        progressLabel.textContent = "Transfer failed!";
        progressBar.style.width = "100%";
        progressBar.classList.add("is-error");
        addResult("failed", "✖", esc(err.message));
        return;
      }

      progressBar.classList.remove("is-indeterminate");

      // Animate results
      const results = data.results || [];
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const pct = Math.round(((i + 1) / results.length) * 100);
        progressBar.style.width = pct + "%";
        progressLabel.textContent = `Processed ${i + 1} of ${results.length}`;

        const head = `<strong>${esc(r.amount)} STEEM → @${esc(r.to)}</strong>`;
        if (r.status === "success") {
          addResult("success", "✔", `${head} — ${esc(r.message)}`);
        } else if (r.status === "failed") {
          addResult("failed", "✖", `${head} — ${esc(r.message)}`);
        } else {
          addResult("skipped", "⏭", `<strong>@${esc(r.to)}</strong> — ${esc(r.message)}`);
        }

        // Stagger animation
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      // Summary
      const s = data.summary;
      summSuccess.textContent = `✔ ${s.succeeded}`;
      summFail.textContent = `✖ ${s.failed}`;
      summSkip.textContent = `⏭ ${s.skipped}`;
      show(summaryBar);
      progressLabel.textContent = "All transfers complete!";
    } finally {
      transferInProgress = false;
      btnTransfer.disabled = false;
      btnCloseModal.disabled = false;
      show(btnDoneModal);
    }
  });

  function addResult(type, icon, html) {
    const el = document.createElement("div");
    el.className = `result-item result-${type}`;
    el.innerHTML = `<span class="result-icon">${icon}</span><span class="result-text">${html}</span>`;
    transferResults.appendChild(el);
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ── Weight filter (shared by Vote History + Report) ─────────

  function createWeightFilter({ pills, custom, min, max, onChange }) {
    const state = { min: 0, max: 10000 };

    const readCustom = () => {
      state.min = (parseInt(min.value, 10) || 0) * 100;
      const maxPct = parseInt(max.value, 10);
      state.max = (isNaN(maxPct) ? 100 : maxPct) * 100;
    };

    pills.addEventListener("click", (e) => {
      const pill = e.target.closest(".filter-pill");
      if (!pill) return;
      $$(".filter-pill", pills).forEach((p) => p.classList.toggle("active", p === pill));
      if (pill.dataset.min === "custom") {
        show(custom);
        readCustom();
      } else {
        hide(custom);
        state.min = parseInt(pill.dataset.min, 10);
        state.max = 10000;
      }
      onChange();
    });

    min.addEventListener("input", () => { readCustom(); onChange(); });
    max.addEventListener("input", () => { readCustom(); onChange(); });

    return {
      apply: (votes) => votes.filter((v) => v.weight >= state.min && v.weight <= state.max),
    };
  }

  // ── Vote History ───────────────────────────────────────────

  const votesGrid = $("#votesGrid");
  const votesLoading = $("#votesLoading");
  const votesEmpty = $("#votesEmpty");
  const votesEmptyText = $("p", votesEmpty);
  const votesFooter = $("#votesFooter");
  const votesTotalBadge = $("#votesTotalBadge");
  const btnRefreshVotes = $("#btnRefreshVotes");
  const btnRefreshVotesLabel = $("#btnRefreshVotesLabel");
  const votesFilterMatch = $("#votesFilterMatch");

  // Shared with report generation (SPA keeps this across views)
  let loadedVotes = [];
  let loadedSender = "";
  let votesFetchedOnce = false;
  let votesRequest = null;

  // 10000 = 100%. Small votes keep decimals (4 → "0.04") instead of rounding to 0.
  function formatWeight(weight) {
    const pct = weight / 100;
    if (Number.isInteger(pct) || Math.abs(pct) >= 10) return pct.toFixed(0);
    return String(parseFloat(pct.toFixed(2)));
  }

  function timeAgo(dateStr) {
    const then = new Date(dateStr + "Z").getTime();
    const diff = Math.max(0, Math.floor((Date.now() - then) / 1000));
    if (diff < 60) return diff + "s ago";
    if (diff < 3600) return Math.floor(diff / 60) + "m ago";
    if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
    return Math.floor(diff / 86400) + "d ago";
  }

  const votesFilter = createWeightFilter({
    pills: $("#votesFilterPills"),
    custom: $("#votesFilterCustom"),
    min: $("#votesFilterMin"),
    max: $("#votesFilterMax"),
    onChange: () => { if (loadedVotes.length > 0) renderVoteCards(); },
  });

  function renderVoteCards() {
    votesGrid.innerHTML = "";
    const filtered = votesFilter.apply(loadedVotes);

    if (filtered.length === 0 && loadedVotes.length > 0) {
      votesEmptyText.textContent = "No votes match the selected filter.";
      show(votesEmpty);
    } else {
      hide(votesEmpty);
    }

    const frag = document.createDocumentFragment();
    filtered.forEach((v, i) => {
      const card = document.createElement("a");
      card.className = "vote-card";
      card.href = v.url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
      card.style.animationDelay = `${Math.min(i, 12) * 30}ms`;

      const weightPercent = formatWeight(v.weight);
      const title = v.title || v.permlink.replace(/-/g, " ");

      card.innerHTML = `
        <div class="vote-card-img${v.coverImage ? "" : " no-img"}">
          <span class="vote-weight-badge">${esc(weightPercent)}%</span>
        </div>
        <div class="vote-card-body">
          <div class="vote-card-title">${esc(title)}</div>
          <div class="vote-card-meta">
            <span class="vote-card-author">@${esc(v.author)}</span>
            <span class="vote-card-time">${esc(timeAgo(v.timestamp))}</span>
          </div>
        </div>`;

      // Set via the style API (not string-built HTML) so URLs can't inject markup
      if (v.coverImage) {
        $(".vote-card-img", card).style.backgroundImage = `url(${JSON.stringify(v.coverImage)})`;
      }
      frag.appendChild(card);
    });
    votesGrid.appendChild(frag);

    votesTotalBadge.innerHTML = `<strong>${filtered.length}</strong> of ${loadedVotes.length} vote(s) shown`;
    votesFilterMatch.innerHTML = `<strong>${filtered.length}</strong> of ${loadedVotes.length} match`;
  }

  // Fetch votes once; concurrent callers (history + report) share the request.
  function fetchVotes() {
    if (!votesRequest) {
      votesRequest = api("/api/votes")
        .then((data) => {
          loadedVotes = data.votes || [];
          loadedSender = data.trackAccount || "";
          votesFetchedOnce = true;
          return data;
        })
        .finally(() => { votesRequest = null; });
    }
    return votesRequest;
  }

  async function loadVotes() {
    votesGrid.innerHTML = "";
    hide(votesEmpty);
    show(votesLoading);
    hide(votesFooter);
    btnRefreshVotes.classList.add("loading");

    try {
      const data = await fetchVotes();

      if (loadedVotes.length === 0) {
        votesEmptyText.innerHTML = `No votes found in the last 24 hours for <strong>@${esc(data.trackAccount)}</strong>.`;
        votesFilterMatch.textContent = "";
        show(votesEmpty);
      } else {
        renderVoteCards();
        show(votesFooter);
      }

      // Keep an already-generated report in sync with fresh data
      if (reportGenerated) regenerateReport();
    } catch (err) {
      votesFetchedOnce = true; // don't auto-retry on every visit; user can hit Refresh
      votesEmptyText.textContent = err.message;
      show(votesEmpty);
      toast(err.message, "error");
    } finally {
      hide(votesLoading);
      btnRefreshVotes.classList.remove("loading");
      btnRefreshVotesLabel.textContent = "Refresh";
    }
  }

  function resetVotes() {
    loadedVotes = [];
    loadedSender = "";
    votesFetchedOnce = false;
    votesGrid.innerHTML = "";
    votesFilterMatch.textContent = "";
    hide(votesFooter);
    votesEmptyText.innerHTML = 'Click <strong>"Load Votes"</strong> to fetch recent votes for your track account.';
    btnRefreshVotesLabel.textContent = "Load Votes";
    show(votesEmpty);
    resetReport();
  }

  btnRefreshVotes.addEventListener("click", loadVotes);

  // ── Report Generation ──────────────────────────────────────

  const reportTextarea = $("#reportTextarea");
  const reportStats = $("#reportStats");
  const reportEmpty = $("#reportEmpty");
  const reportEmptyText = $("p", reportEmpty);
  const reportLoading = $("#reportLoading");
  const reportFooter = $("#reportFooter");
  const btnGenerateReport = $("#btnGenerateReport");
  const btnCopyReport = $("#btnCopyReport");
  const filterMatch = $("#filterMatch");

  const COPY_LABEL = btnCopyReport.innerHTML;
  let reportGenerated = false;

  const reportFilter = createWeightFilter({
    pills: $("#filterPills"),
    custom: $("#filterCustom"),
    min: $("#filterMin"),
    max: $("#filterMax"),
    onChange: () => { updateFilterMatch(); regenerateReport(); },
  });

  function updateFilterMatch() {
    if (loadedVotes.length === 0) {
      filterMatch.textContent = "";
      return;
    }
    const filtered = reportFilter.apply(loadedVotes);
    filterMatch.innerHTML = `<strong>${filtered.length}</strong> of ${loadedVotes.length} post(s) match`;
  }

  function buildReport(votes) {
    const dateStr = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    let md = `# Daily Curation Report — ${dateStr}\n\n`;
    md += `> This report was generated by **@${loadedSender}** and covers the last 24 hours of curation activity.\n\n`;
    md += `---\n\n`;
    md += `## Posts Curated Today: ${votes.length}\n\n`;

    for (const v of votes) {
      const title = v.title || v.permlink.replace(/-/g, " ");
      const weightPercent = formatWeight(v.weight);
      const postUrl = `https://steemit.com/@${v.author}/${v.permlink}`;

      if (v.coverImage) {
        md += `<center>\n\n`;
        md += `[![${title}](${v.coverImage})](${postUrl})\n\n`;
        md += `</center>\n\n`;
      }

      md += `### [${title}](${postUrl})\n`;
      md += `**Author:** @${v.author} | **Vote Weight:** ${weightPercent}%\n\n`;
      md += `---\n\n`;
    }

    md += `*This report was auto-generated using [Steem Batch Transfer Bot](https://github.com/Steemblocks/Steem-Batch-Transfer-Bot).*\n`;
    return md;
  }

  function regenerateReport() {
    if (!reportGenerated) return;
    updateFilterMatch();

    if (loadedVotes.length === 0) {
      hide(reportTextarea);
      hide(reportFooter);
      reportEmptyText.textContent = "No votes found in the last 24 hours. Nothing to report.";
      show(reportEmpty);
      return;
    }

    const filtered = reportFilter.apply(loadedVotes);
    if (filtered.length === 0) {
      hide(reportTextarea);
      hide(reportFooter);
      reportEmptyText.textContent = "No votes match the selected filter. Try adjusting the vote weight range.";
      show(reportEmpty);
      return;
    }

    hide(reportEmpty);
    const md = buildReport(filtered);
    reportTextarea.value = md;
    show(reportTextarea);
    reportStats.textContent = `${filtered.length} post(s) · ${md.length} characters`;
    show(reportFooter);
  }

  function resetReport() {
    reportGenerated = false;
    reportTextarea.value = "";
    hide(reportTextarea);
    hide(reportFooter);
    filterMatch.textContent = "";
    reportEmptyText.innerHTML = 'Click <strong>"Generate"</strong> to build a curation report from your recent votes.';
    show(reportEmpty);
  }

  btnGenerateReport.addEventListener("click", async () => {
    hide(reportEmpty);
    hide(reportTextarea);
    hide(reportFooter);
    show(reportLoading);
    btnGenerateReport.classList.add("loading");

    try {
      // Reuse votes already fetched on the Vote History view
      if (!votesFetchedOnce || loadedVotes.length === 0) {
        await fetchVotes();
      }
      reportGenerated = true;
      regenerateReport();
    } catch (err) {
      reportEmptyText.textContent = err.message;
      show(reportEmpty);
      toast(`Failed to generate report: ${err.message}`, "error");
    } finally {
      hide(reportLoading);
      btnGenerateReport.classList.remove("loading");
    }
  });

  btnCopyReport.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(reportTextarea.value);
    } catch {
      reportTextarea.select();
      document.execCommand("copy");
    }
    btnCopyReport.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
    btnCopyReport.classList.add("btn-copied");
    setTimeout(() => {
      btnCopyReport.innerHTML = COPY_LABEL;
      btnCopyReport.classList.remove("btn-copied");
    }, 2000);
  });

  // ── Modal Controls ─────────────────────────────────────────

  function openModal() {
    transferModal.classList.add("open");
  }

  function closeModal() {
    if (transferInProgress) return; // keep progress visible until done
    transferModal.classList.remove("open");
  }

  btnCloseModal.addEventListener("click", closeModal);
  btnDoneModal.addEventListener("click", closeModal);

  transferModal.addEventListener("click", (e) => {
    if (e.target === transferModal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && confirmModal.classList.contains("open")) return; // handled by confirm dialog
    if (e.key === "Escape" && transferModal.classList.contains("open")) closeModal();
  });

  // ── Confirm Dialog ─────────────────────────────────────────

  const confirmModal = $("#confirmModal");
  const confirmTitle = $("#confirmTitle");
  const confirmMessage = $("#confirmMessage");
  const confirmDetails = $("#confirmDetails");
  const btnConfirmOk = $("#btnConfirmOk");
  const btnConfirmCancel = $("#btnConfirmCancel");

  /**
   * In-app replacement for window.confirm(). Resolves true on confirm,
   * false on cancel / Escape / backdrop click.
   * `message` and `detailsHtml` are inserted as HTML — escape user data first.
   */
  function confirmDialog({ title = "Are you sure?", message = "", detailsHtml = "", confirmText = "Confirm", cancelText = "Cancel" } = {}) {
    return new Promise((resolve) => {
      const prevFocus = document.activeElement;
      confirmTitle.textContent = title;
      confirmMessage.innerHTML = message;
      confirmDetails.innerHTML = detailsHtml;
      confirmDetails.hidden = !detailsHtml;
      btnConfirmOk.textContent = confirmText;
      btnConfirmCancel.textContent = cancelText;

      const finish = (result) => {
        confirmModal.classList.remove("open");
        btnConfirmOk.removeEventListener("click", onOk);
        btnConfirmCancel.removeEventListener("click", onCancel);
        confirmModal.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onKey, true);
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        resolve(result);
      };
      const onOk = () => finish(true);
      const onCancel = () => finish(false);
      const onBackdrop = (e) => { if (e.target === confirmModal) finish(false); };
      const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); finish(false); }
        else if (e.key === "Tab") {
          // Keep focus trapped between the two buttons
          e.preventDefault();
          (document.activeElement === btnConfirmOk ? btnConfirmCancel : btnConfirmOk).focus();
        }
      };

      btnConfirmOk.addEventListener("click", onOk);
      btnConfirmCancel.addEventListener("click", onCancel);
      confirmModal.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onKey, true);

      confirmModal.classList.add("open");
      // Focus Cancel by default — safer for an irreversible action
      setTimeout(() => btnConfirmCancel.focus(), 50);
    });
  }

  // Warn before closing the tab with unsaved edits or a running batch
  window.addEventListener("beforeunload", (e) => {
    if (recipientsDirty || transferInProgress) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  // ── Init ───────────────────────────────────────────────────

  const initialPath = normalizePath(location.pathname);
  if (!initialPath) history.replaceState({}, "", "/");
  render(initialPath || "/");

  // Re-measure the indicator once web fonts have loaded (label widths change)
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => moveIndicator(false));
  }

  loadAccount();
  loadRecipients();
})();
