"use strict";
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const clean = (v) => String(v ?? "").trim();
  const key = (v) => clean(v).toLowerCase().replace(/\s+/g, " ");
  const prefix = "lab-bank:v1:";
  const stateKey = () => prefix + "progress:" + active;
  const get = (k, fallback) => {
    const value = localStorage.getItem(k);
    return value === null ? fallback : JSON.parse(value);
  };
  const put = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const safeId = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$/;
  const dateOK = (v) =>
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    Number.isFinite(Date.parse(v + "T12:00:00Z")) &&
    new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v;
  const priceOK = (v) =>
    typeof v === "number" &&
    Number.isFinite(v) &&
    Math.abs(v * 100 - Math.round(v * 100)) < 0.00001 &&
    Math.abs(v) <= 999999999;
  const dateFmt = (v) =>
    new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(v + "T12:00:00Z"));
  const money = (v) =>
    Number(v).toLocaleString("en-AU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const cents = (v) => Math.round(Number(v) * 100);
  const direction = (r) => (r.spent > 0 ? "spent" : "received");
  const amount = (r) => r[direction(r)];
  const when = () => new Date().toISOString();
  const app = $("#app"),
    modal = $("#modal"),
    status = $("#status");
  const start = () => ({ rows: {}, suggest: true, compact: false });
  let sample,
    data,
    active,
    s,
    view = "open",
    q = "",
    onlyNotes = false,
    modalRow = "",
    timer;
  function notify(t) {
    clearTimeout(timer);
    status.textContent = t;
    timer = setTimeout(() => (status.textContent = ""), 5000);
  }
  function validate(x) {
    if (
      !x ||
      !safeId.test(x.id) ||
      !["practice", "presenter"].includes(x.mode) ||
      !clean(x.name) ||
      !clean(x.accountName) ||
      x.currency !== "AUD" ||
      !priceOK(x.statementBalance) ||
      !priceOK(x.xeroBalance) ||
      !Number.isInteger(x.importedCount) ||
      x.importedCount < 0 ||
      !Array.isArray(x.rows) ||
      !x.rows.length ||
      x.rows.length > 500 ||
      !Array.isArray(x.ledger) ||
      !Array.isArray(x.evidence)
    )
      throw Error(
        "Not a workshop statement. Choose the supplied presenter JSON file.",
      );
    for (const list of [x.rows, x.ledger, x.evidence]) {
      const ids = new Set();
      for (const r of list) {
        if (
          !r ||
          typeof r.id !== "string" ||
          !safeId.test(r.id) ||
          ["constructor", "prototype", "__proto__"].includes(r.id) ||
          ids.has(r.id) ||
          !dateOK(r.date)
        )
          throw Error("Each item needs a unique ID and a valid date.");
        ids.add(r.id);
      }
    }
    for (const r of x.rows)
      if (
        !clean(r.payee) ||
        !priceOK(r.spent) ||
        !priceOK(r.received) ||
        Math.min(r.spent, r.received) !== 0 ||
        Math.max(r.spent, r.received) <= 0
      )
        throw Error(
          "Each bank line needs a payee and a positive amount in one direction.",
        );
    for (const l of x.ledger)
      if (
        !clean(l.reference) ||
        !priceOK(l.amount) ||
        l.amount <= 0 ||
        !["spent", "received"].includes(l.direction)
      )
        throw Error("Invalid account transaction.");
    for (const e of x.evidence)
      if (!clean(e.source) || !clean(e.title) || !clean(e.body))
        throw Error("Invalid evidence record.");
    return x;
  }
  function activate(id, obj) {
    const loaded = get(prefix + "progress:" + id, start());
    put(prefix + "active", id);
    active = id;
    data = obj;
    s = loaded;
    q = "";
    onlyNotes = false;
    view = "open";
    $("#search").value = "";
    $("#only-notes").checked = false;
    render();
    if (modal.open) modal.close();
  }
  function save() {
    put(stateKey(), s);
  }
  const lineState = (r) => s.rows[r.id] || {};
  const rowBy = (id) => data.rows.find((r) => r.id === id);
  function patch(id, changes) {
    s.rows[id] = { ...s.rows[id], ...changes };
    save();
  }
  function draft(r) {
    const st = lineState(r);
    return { ...(s.suggest ? r.suggestion : {}), ...st.draft };
  }
  const mode = (r) => lineState(r).tab || "create";
  const attr = (name, id) =>
    ' id="' +
    esc(id + "-" + name) +
    '" data-field="' +
    esc(name) +
    '" name="' +
    esc(name) +
    '"';
  function field(r, name, label, opts = {}) {
    const a = attr(name, r.id),
      val = esc(draft(r)[name]),
      cl = opts.inline ? "inline-field" : "field";
    const ctrl = opts.textarea
      ? "<textarea" +
        a +
        ' rows="2" maxlength="6000" placeholder="' +
        esc(opts.hint) +
        '">' +
        val +
        "</textarea>"
      : "<input" +
        a +
        ' type="' +
        (opts.type || "text") +
        '" ' +
        (opts.list ? 'list="' + opts.list + '"' : "") +
        " " +
        (opts.type === "number"
          ? 'step="0.01" min="0.01"'
          : 'maxlength="2000"') +
        ' value="' +
        val +
        '" placeholder="' +
        esc(opts.hint) +
        '">';
    return (
      '<label class="' +
      cl +
      (opts.wide ? " wide" : "") +
      '"><span>' +
      esc(label) +
      "</span>" +
      ctrl +
      "</label>"
    );
  }
  function attachment(r) {
    const rec = lineState(r).receipt;
    return (
      '<div class="field wide"><span>Attach receipt</span><div class="attachment"><input type="file" aria-label="Attach receipt to ' +
      esc(r.id) +
      '" data-file-row="' +
      esc(r.id) +
      '">' +
      (rec
        ? '<button type="button" data-action="download" class="inline-action">Download ' +
          esc(rec.name) +
          "</button>"
        : "") +
      '</div><span class="helper">Optional · saved on this device (up to 20 MB).</span></div>'
    );
  }
  function tracking(r) {
    return (
      field(r, "event", "Event name", { hint: "Event, if applicable" }) +
      field(r, "project", "Project name", { hint: "Project, if applicable" }) +
      field(r, "tax", "Tax rate", {
        hint: "Choose or enter tax rate",
        list: "taxes",
      }) +
      field(r, "document", "Document reference", {
        hint: "Invoice or receipt number",
      })
    );
  }
  function sourceFields(r) {
    return (
      field(r, "source", "Evidence reference", {
        wide: true,
        textarea: true,
        hint: "Source link or document ID; what connects it to this bank line?",
      }) +
      '<button type="button" class="inline-action wide" data-action="row-evidence">Open evidence desk ↗</button>' +
      attachment(r)
    );
  }
  function details(r) {
    const d = draft(r);
    return (
      '<details class="details-box" data-details' +
      (lineState(r).expanded ? " open" : "") +
      '><summary><span class="detail-hint">' +
      esc(d.event || "Event name") +
      "　 " +
      esc(d.project || "Project name") +
      "　 " +
      esc(d.tax || "Tax rate") +
      '</span> Add details</summary><div class="fields">' +
      tracking(r) +
      sourceFields(r) +
      "</div></details>"
    );
  }
  const sameAmount = (r, l) =>
    l.direction === direction(r) && cents(l.amount) === cents(amount(r));
  const otherDone = (r) =>
    data.rows
      .filter((o) => o.id !== r.id && lineState(o).done)
      .map((o) => lineState(o).done);
  const used = (r, l) =>
    otherDone(r).some(
      (d) =>
        d.kind === "match" &&
        (d.ledgerId === l.id || key(d.reference) === key(l.reference)),
    );
  function matchEditor(r) {
    const d = draft(r),
      choices = data.ledger.filter((l) => sameAmount(r, l));
    let option =
      '<option value="">Choose an existing transaction…</option>' +
      choices
        .map(
          (l) =>
            '<option value="' +
            esc(l.id) +
            '"' +
            (used(r, l) ? " disabled" : "") +
            (d.matchId === l.id ? " selected" : "") +
            ">" +
            esc(
              l.reference +
                " · " +
                l.contact +
                " · " +
                money(l.amount) +
                (used(r, l) ? " (already matched)" : ""),
            ) +
            "</option>",
        )
        .join("");
    if (data.mode === "presenter")
      option +=
        '<option value="external"' +
        (d.matchId === "external" ? " selected" : "") +
        ">Enter a verified existing transaction…</option>";
    const selected = data.ledger.find((l) => l.id === d.matchId),
      external = d.matchId === "external" && data.mode === "presenter";
    return (
      '<div class="fields"><label class="field wide"><span>Find an existing transaction</span><select' +
      attr("matchId", r.id) +
      ">" +
      option +
      "</select></label>" +
      (selected
        ? '<p class="helper wide">' +
          esc(
            dateFmt(selected.date) +
              " · " +
              selected.description +
              " · " +
              selected.direction +
              " " +
              money(selected.amount),
          ) +
          "</p>"
        : "") +
      (external
        ? field(r, "externalRef", "Existing transaction reference", {
            hint: "Verified record ID",
          }) +
          field(r, "externalAmount", "Recorded amount (AUD)", {
            type: "number",
          }) +
          '<label class="field"><span>Recorded direction</span><select' +
          attr("externalDirection", r.id) +
          '><option value="">Choose direction…</option>' +
          ["spent", "received"]
            .map(
              (v) =>
                '<option value="' +
                v +
                '"' +
                (d.externalDirection === v ? " selected" : "") +
                ">" +
                v +
                "</option>",
            )
            .join("") +
          "</select></label>" +
          field(r, "externalContact", "Recorded contact", {
            hint: "Contact on the record",
          }) +
          field(r, "externalWhy", "Recorded purpose", {
            wide: true,
            hint: "Description on the verified record",
          })
        : "") +
      (!choices.length && !external
        ? '<p class="helper wide">' +
          (data.mode === "presenter"
            ? "No existing transactions were supplied. Enter a record only after verifying it in a connected source."
            : "No existing account transaction has this direction and amount.") +
          "</p>"
        : "") +
      sourceFields(r) +
      "</div>"
    );
  }
  function editor(r) {
    const m = mode(r);
    const tabs = ["match", "create", "discuss"]
      .map(
        (k) =>
          '<button type="button" data-mode="' +
          k +
          '" class="' +
          (m === k ? "active" : "") +
          '" aria-pressed="' +
          (m === k) +
          '">' +
          k[0].toUpperCase() +
          k.slice(1) +
          "</button>",
      )
      .join("");
    const controls =
      m === "create"
        ? '<div class="fields">' +
          field(r, "contact", "Who", {
            inline: true,
            hint: "Name of the contact…",
          }) +
          field(r, "account", "What", {
            inline: true,
            list: "accounts",
            hint: "Choose the account…",
          }) +
          field(r, "description", "Why", {
            inline: true,
            wide: true,
            hint: "Enter a description…",
          }) +
          "</div>" +
          details(r)
        : m === "match"
          ? matchEditor(r)
          : '<div class="fields">' +
            field(r, "note", "Discussion note", {
              wide: true,
              textarea: true,
              hint: "What might this be? Which missing fact would confirm it?",
            }) +
            '<p class="helper wide">Leave a provisional description or question. This line stays unreconciled.</p><button data-action="note" type="button" class="secondary discuss-save wide">Save note &amp; keep open</button></div>';
    return (
      '<div><div class="row-tabs" role="group" aria-label="Decision for ' +
      esc(r.id) +
      '">' +
      tabs +
      '<button class="find" data-mode="match" type="button">Find &amp; Match</button></div><div class="editor">' +
      controls +
      '</div><p role="alert" class="error" id="' +
      esc(r.id) +
      '-error"></p></div>'
    );
  }
  function statement(r) {
    const st = lineState(r);
    return (
      '<div><div class="row-label"><span>LINE ' +
      esc(r.id) +
      "</span>" +
      (st.note ? '<span class="status-chip">Review note · open</span>' : "") +
      '</div><div class="statement"><div class="particulars"><time datetime="' +
      esc(r.date) +
      '">' +
      dateFmt(r.date) +
      '</time><strong class="merchant">' +
      esc(r.payee) +
      '</strong><div class="desc">' +
      esc(r.description) +
      '</div><div class="refs">' +
      esc(r.reference) +
      '</div><button type="button" class="more" data-action="line-detail">More details</button></div>' +
      ["spent", "received"]
        .map(
          (k) =>
            '<div class="money"><small>' +
            k[0].toUpperCase() +
            k.slice(1) +
            "</small><b>" +
            (r[k] ? money(r[k]) : "") +
            "</b></div>",
        )
        .join("") +
      "</div>" +
      (st.note
        ? '<div class="saved-note"><strong>Discuss:</strong> ' +
          esc(st.note) +
          "</div>"
        : "") +
      "</div>"
    );
  }
  function rowHTML(r) {
    return (
      '<article id="line-' +
      esc(r.id) +
      '" data-row="' +
      esc(r.id) +
      '" class="bank-row" aria-label="' +
      esc(r.id) +
      " · " +
      esc(r.payee) +
      '">' +
      statement(r) +
      '<div class="row-command">' +
      (mode(r) === "discuss"
        ? ""
        : '<button type="button" class="primary" data-action="ok" aria-label="OK: reconcile ' +
          esc(r.id) +
          '">OK</button>') +
      "</div>" +
      editor(r) +
      "</article>"
    );
  }
  function searched(r) {
    const st = lineState(r);
    return (
      !q ||
      key(
        [
          r.id,
          r.payee,
          r.description,
          r.reference,
          r.date,
          money(amount(r)),
          amount(r),
          st.note,
          ...Object.values(st.done || {}),
          ...Object.values(st.draft || {}),
        ].join(" "),
      ).includes(q)
    );
  }
  function sourceText(raw) {
    // Keep evidence links inert until the participant chooses to open one.
    return String(raw || "Attached receipt")
      .split(/(https?:\/\/[^\s<>]+)/gi)
      .map((part) =>
        /^https?:\/\//i.test(part)
          ? '<a target="_blank" rel="noopener noreferrer" href="' +
            esc(part) +
            '">' +
            esc(part) +
            "</a>"
          : esc(part),
      )
      .join("");
  }
  function doneCard(r) {
    const d = lineState(r).done,
      att = lineState(r).receipt;
    return (
      '<article class="review-card" data-row="' +
      esc(r.id) +
      '"><header><div><div class="kicker">' +
      esc(
        d.kind === "match"
          ? "MATCHED EXISTING TRANSACTION"
          : "CREATED ACCOUNT TRANSACTION",
      ) +
      " · " +
      esc(r.id) +
      "</div><strong>" +
      esc(r.payee) +
      " · " +
      money(amount(r)) +
      " AUD " +
      direction(r) +
      '</strong></div><button class="secondary" data-action="undo">Undo reconciliation</button></header><p>' +
      esc(d.description) +
      '</p><p class="helper">' +
      esc(
        [d.contact, d.account, d.event, d.project, d.tax, d.reference]
          .filter(Boolean)
          .join(" · "),
      ) +
      "</p><p><strong>Evidence:</strong> " +
      sourceText(d.source) +
      "</p>" +
      (att
        ? '<button class="inline-action" data-action="download">Download ' +
          esc(att.name) +
          "</button>"
        : "") +
      "</article>"
    );
  }
  function records() {
    if (view === "review") {
      const a = data.rows.filter((r) => lineState(r).done && searched(r));
      return {
        n: a.length,
        html:
          '<div class="records"><h2>Reconciled lines</h2><p class="helper">Check what was saved against each bank line. Undo returns the line to the queue.</p>' +
          (a.length
            ? a.map(doneCard).join("")
            : '<p class="empty">No reconciled lines to show.</p>') +
          "</div>",
      };
    }
    if (view === "statements") {
      const a = data.rows.filter(searched);
      return {
        n: a.length,
        html:
          '<div class="records"><h2>Bank statement lines</h2><p class="helper">Original statement details stay available after reconciliation.</p><table><thead><tr><th>Line / date</th><th>Payee</th><th>Reference</th><th>Spent</th><th>Received</th><th>Status</th></tr></thead><tbody>' +
          a
            .map(
              (r) =>
                '<tr data-row="' +
                esc(r.id) +
                '"><td>' +
                esc(r.id) +
                "<small>" +
                dateFmt(r.date) +
                "</small></td><td>" +
                esc(r.payee) +
                "</td><td>" +
                esc(r.reference) +
                "</td><td>" +
                (r.spent ? money(r.spent) : "—") +
                "</td><td>" +
                (r.received ? money(r.received) : "—") +
                "</td><td>" +
                esc(
                  lineState(r).done
                    ? "Reconciled"
                    : lineState(r).note
                      ? "Open · review note"
                      : "Open",
                ) +
                "</td></tr>",
            )
            .join("") +
          "</tbody></table></div>",
      };
    }
    const rows = data.ledger.map((l) => ({
      ...l,
      status: "Existing · unmatched",
    }));
    for (const r of data.rows) {
      const d = lineState(r).done;
      if (!d) continue;
      const member =
        d.kind === "match" ? rows.find((l) => l.id === d.ledgerId) : null;
      if (member) member.status = "Matched · " + r.id;
      else
        rows.push({
          date: r.date,
          contact: d.contact,
          description: d.description,
          reference: d.reference || "LAB-" + r.id,
          amount: amount(r),
          direction: direction(r),
          status:
            (d.kind === "match" ? "Verified external match" : "Created") +
            " · " +
            r.id,
        });
    }
    const a = rows.filter(
      (l) =>
        !q ||
        key(Object.values(l).join(" ") + " " + money(l.amount)).includes(q),
    );
    return {
      n: a.length,
      html:
        '<div class="records"><h2>Account transactions</h2><p class="helper">Matching links an existing item. Creating adds one new entry to this practice ledger.</p>' +
        (a.length
          ? "<table><thead><tr><th>Date</th><th>Contact / purpose</th><th>Reference</th><th>Amount (AUD)</th><th>Status</th></tr></thead><tbody>" +
            a
              .map(
                (l) =>
                  "<tr><td>" +
                  dateFmt(l.date) +
                  "</td><td>" +
                  esc(l.contact) +
                  "<small>" +
                  esc(l.description) +
                  "</small></td><td>" +
                  esc(l.reference) +
                  "</td><td>" +
                  money(l.amount) +
                  " " +
                  esc(l.direction) +
                  "</td><td>" +
                  esc(l.status) +
                  "</td></tr>",
              )
              .join("") +
            "</tbody></table>"
          : '<p class="empty">No account transactions to show.</p>') +
        "</div>",
    };
  }
  function render() {
    const open = data.rows.filter((r) => !lineState(r).done),
      done = data.rows.length - open.length;
    $("#account-name").textContent = data.accountName;
    $("#statement-balance").textContent = money(data.statementBalance);
    let ledgerCents = cents(data.xeroBalance);
    for (const row of data.rows) {
      if (lineState(row).done?.kind === "create") {
        ledgerCents += cents(row.received) - cents(row.spent);
      }
    }
    $("#xero-balance").textContent = money(ledgerCents / 100);
    $("#import-count").textContent = data.importedCount;
    $("#mode-badge").textContent =
      data.mode === "practice"
        ? "Fictional practice statement"
        : "Presenter statement · local only";
    $("#open-count").textContent = open.length;
    $("#done-count").textContent = done;
    $("#compact").checked = s.compact;
    $("#suggest").checked = s.suggest;
    document.body.classList.toggle("compact-mode", s.compact);
    document.querySelectorAll("[data-view]").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === view);
      b.setAttribute(
        "aria-current",
        b.dataset.view === view ? "page" : "false",
      );
    });
    $(".held-filter").hidden = view !== "open";
    $("#suggest-wrap").hidden = view !== "open";
    let count;
    if (view === "open") {
      const a = open.filter(
        (r) => searched(r) && (!onlyNotes || lineState(r).note),
      );
      count = a.length;
      app.innerHTML =
        '<div class="queue"><div class="colheads"><span>Review your bank statement lines…</span><span>…then match with your transactions in Xero</span></div>' +
        (a.length
          ? a.map(rowHTML).join("")
          : '<p class="empty">' +
            (open.length
              ? "No open lines match these filters."
              : "All statement lines have been reconciled. See Reconciled for the decisions.") +
            "</p>") +
        "</div>";
    } else {
      const rec = records();
      count = rec.n;
      app.innerHTML = rec.html;
    }
    $("#count-label").textContent =
      "Showing " +
      count +
      " " +
      (count === 1 ? "item" : "items") +
      (view === "open" ? " · " + open.length + " open in total" : "");
  }
  function fail(r, message, name, expand = false) {
    if (expand) {
      const det = document
        .getElementById("line-" + r.id)
        ?.querySelector("[data-details]");
      if (det) det.open = true;
    }
    const error = document.getElementById(r.id + "-error");
    if (error) error.textContent = message;
    if (name) document.getElementById(r.id + "-" + name)?.focus();
    notify(message);
  }
  function reconcile(r) {
    const st = lineState(r),
      m = mode(r),
      d = draft(r);
    if (st.done || !["match", "create"].includes(m)) return;
    if (
      m === "create" &&
      (!clean(d.contact) || !clean(d.account) || !clean(d.description))
    )
      return fail(
        r,
        "Complete Who, What and Why before creating an entry.",
        ["contact", "account", "description"].find((k) => !clean(d[k])),
      );
    const ref = clean(d.document) || r.reference;
    const sameRef = (v, w) => !!clean(v) && key(v) === key(w);
    if (
      m === "create" &&
      (data.ledger.some(
        (l) =>
          sameAmount(r, l) &&
          (sameRef(l.reference, ref) || sameRef(l.reference, r.reference)),
      ) ||
        otherDone(r).some((done) => sameRef(done.reference, ref)))
    )
      return fail(
        r,
        "This reference is already in the ledger. Check Find & Match before creating another transaction.",
      );
    if (m === "create" && !clean(d.tax))
      return fail(
        r,
        "Enter the supported tax rate, or keep this line open for review.",
        "tax",
        true,
      );
    let done;
    if (m === "match") {
      const l = data.ledger.find((l) => l.id === d.matchId);
      if (l) {
        if (!sameAmount(r, l) || used(r, l))
          return fail(
            r,
            "This transaction is already matched or has a different amount or direction.",
            "matchId",
          );
        done = {
          ledgerId: l.id,
          contact: l.contact,
          description: l.description,
          reference: l.reference,
        };
      } else if (d.matchId === "external" && data.mode === "presenter") {
        if (
          !clean(d.externalRef) ||
          !clean(d.externalContact) ||
          !clean(d.externalWhy)
        )
          return fail(
            r,
            "Record the existing transaction’s reference, contact and purpose.",
            ["externalRef", "externalContact", "externalWhy"].find(
              (k) => !clean(d[k]),
            ),
          );
        if (
          !priceOK(Number(d.externalAmount)) ||
          cents(d.externalAmount) !== cents(amount(r)) ||
          d.externalDirection !== direction(r)
        )
          return fail(
            r,
            "The existing transaction must have the same amount and direction as this statement line.",
            "externalAmount",
          );
        if (
          otherDone(r).some((e) => sameRef(e.reference, d.externalRef)) ||
          data.ledger.some((l) => sameRef(l.reference, d.externalRef))
        )
          return fail(
            r,
            "This reference is already recorded. Choose the existing, unmatched record or check the statement.",
            "externalRef",
          );
        done = {
          external: true,
          reference: clean(d.externalRef),
          contact: clean(d.externalContact),
          description: clean(d.externalWhy),
        };
      } else
        return fail(
          r,
          "Choose a verified existing transaction to match.",
          "matchId",
        );
    } else {
      done = Object.fromEntries(
        ["contact", "account", "description", "event", "project", "tax"].map(
          (k) => [k, clean(d[k])],
        ),
      );
      done.reference = ref;
    }
    if (!clean(d.source) && !st.receipt)
      return fail(
        r,
        "Add evidence: enter a source reference or attach a receipt.",
        "source",
        true,
      );
    patch(r.id, {
      done: { ...done, kind: m, source: clean(d.source), at: when() },
    });
    render();
    notify(
      r.id +
        " reconciled · " +
        (m === "match"
          ? "matched to an existing transaction."
          : "created one account transaction."),
    );
  }
  function panel(title, html, row = "") {
    modalRow = row;
    $("#modal-title").textContent = title;
    $("#modal-body").innerHTML = html;
    if (!modal.open) modal.showModal();
    modal.scrollTop = 0;
    modal.querySelector(".close").focus();
  }
  function receiptPath(e) {
    // Imported workspaces cannot introduce remote resources or load URLs from the presenter's file.
    return data.mode === "practice" &&
      e &&
      typeof e.href === "string" &&
      /^receipts\/[a-zA-Z0-9_-]+\.pdf$/.test(e.href)
      ? e.href
      : "";
  }
  function evidence(row = "") {
    const cards = data.evidence
      .map((e) => {
        const href = receiptPath(e);
        return (
          '<article class="source-card" id="source-' +
          esc(e.id) +
          '"><div class="kicker">' +
          esc(e.source) +
          " · " +
          esc(e.id) +
          " · " +
          dateFmt(e.date) +
          "</div><h3>" +
          esc(e.title) +
          "</h3><p>" +
          esc(e.body) +
          "</p>" +
          (href
            ? '<a href="' +
              esc(href) +
              '" target="_blank" rel="noopener noreferrer">Open receipt PDF ↗</a> '
            : "") +
          (row
            ? '<div><button class="secondary" data-use="' +
              esc(e.id) +
              '">' +
              (href
                ? "Attach receipt &amp; cite source"
                : "Cite source on this line") +
              "</button></div>"
            : "") +
          "</article>"
        );
      })
      .join("");
    panel(
      "Evidence desk",
      data.mode === "practice"
        ? "<p>These fictional records stand in for searches across Gmail, Slack and Calendar. Compare the references, dates and amounts before choosing an action.</p>" +
            cards
        : "<p>This presenter statement has no connected inbox or calendar inside the sandbox. Use your AI’s connected Gmail, Slack or Calendar to research each line. Paste a source link or document reference under <strong>Add details → Evidence reference</strong>, or attach a receipt saved on your device.</p>" +
            (cards || ""),
      row,
    );
  }
  const imports = () => get(prefix + "imports", {});
  function datasets() {
    const records = imports();
    const item = (id, ds) =>
      '<div class="dataset-item"><div><h3>' +
      esc(ds.name) +
      "</h3><small>" +
      ds.rows.length +
      " statement lines · " +
      (ds.mode === "practice"
        ? "fictional practice data"
        : "local presenter statement") +
      "</small></div>" +
      (active === id
        ? "<strong>Active</strong>"
        : '<button class="secondary" data-dataset="' +
          esc(id) +
          '">Open</button>') +
      "</div>";
    panel(
      "Switch / import statement",
      "<p>Each statement keeps its own progress on this device.</p>" +
        item("practice", sample) +
        Object.entries(records)
          .map(([id, ds]) => item(id, ds))
          .join("") +
        '<div class="filebox"><strong>Open a presenter statement</strong><p>Select the supplied local JSON file. Its contents stay in this browser.</p><input class="import-file" id="import-json" type="file" accept=".json,application/json" aria-label="Import presenter statement JSON"><p role="alert" id="import-error" class="error"></p></div>',
    );
  }
  async function importJSON(file) {
    if (!file) return;
    try {
      if (file.size > 1024 * 1024)
        throw Error("Use a workshop statement smaller than 1 MB.");
      const raw = await file.text(),
        obj = validate(JSON.parse(raw));
      if (obj.mode !== "presenter")
        throw Error("Choose a presenter statement file.");
      // Use a content fingerprint so a different edition cannot inherit stale row decisions.
      const bytes = new TextEncoder().encode(JSON.stringify(obj)),
        hash = await crypto.subtle.digest("SHA-256", bytes);
      const id =
        "import-" +
        Array.from(new Uint8Array(hash), (v) =>
          v.toString(16).padStart(2, "0"),
        ).join("");
      const list = imports();
      list[id] = obj;
      put(prefix + "imports", list);
      activate(id, obj);
      notify("Presenter statement opened locally.");
    } catch (e) {
      const el = $("#import-error");
      if (el) el.textContent = "Could not import: " + e.message;
    }
  }
  function db() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("workshop-bank-receipts-v1", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("files");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
    });
  }
  async function fileOp(method, k, v) {
    const con = await db();
    try {
      return await new Promise((resolve, reject) => {
        const tx = con.transaction(
            "files",
            method === "get" ? "readonly" : "readwrite",
          ),
          store = tx.objectStore("files");
        const req = method === "put" ? store.put(v, k) : store.get(k);
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () =>
          reject(tx.error || Error("Receipt storage unavailable."));
      });
    } finally {
      con.close();
    }
  }
  async function attach(r, blob, name, source = "") {
    if (!blob || blob.size > 20 * 1024 * 1024)
      throw Error("Choose a receipt smaller than 20 MB.");
    const target = active,
      receiptKey = target + ":" + r.id + ":" + crypto.randomUUID();
    await fileOp("put", receiptKey, blob);
    if (active !== target)
      throw Error("The active statement changed. Re-open the intended line.");
    const st = lineState(r),
      d = draft(r),
      old = st.receipt;
    let changes = {
      receipt: { key: receiptKey, name, size: blob.size },
      expanded: true,
    };
    if (source)
      changes.draft = {
        ...st.draft,
        source: [d.source, source].filter(Boolean).join("\n"),
      };
    patch(r.id, changes);
    render();
    if (old) {
      const con = await db();
      const tx = con.transaction("files", "readwrite");
      tx.objectStore("files").delete(old.key);
      tx.oncomplete = () => con.close();
      tx.onabort = () => con.close();
    }
  }
  async function download(r) {
    const rec = lineState(r).receipt;
    if (!rec) return;
    const blob = await fileOp("get", rec.key);
    if (!blob) throw Error("The receipt could not be found on this device.");
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = rec.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function rowDetails(r) {
    const st = lineState(r);
    panel(
      "Statement line " + r.id,
      '<div class="source-card"><div class="kicker">' +
        dateFmt(r.date) +
        " · " +
        esc(data.currency) +
        "</div><h3>" +
        esc(r.payee) +
        "</h3><p><strong>" +
        money(amount(r)) +
        " " +
        direction(r) +
        "</strong></p><p>" +
        esc(r.description) +
        "</p><p>Reference: " +
        esc(r.reference) +
        "</p>" +
        (r.detailNote ? "<p>" + esc(r.detailNote) + "</p>" : "") +
        "</div>" +
        (st.note
          ? "<p><strong>Open question:</strong> " + esc(st.note) + "</p>"
          : "") +
        '<p class="helper">Use this date, amount, payee and reference to search the available evidence.</p>',
    );
  }
  function focusTab(r) {
    const row = document.getElementById("line-" + r.id);
    row
      ?.querySelector('[data-mode="' + mode(r) + '"]')
      ?.focus({ preventScroll: true });
  }
  async function clicked(ev) {
    const btn = ev.target.closest("button");
    if (!btn || !data) return;
    const id = btn.closest("[data-row]")?.dataset.row,
      r = rowBy(id),
      act = btn.dataset.action;
    if (btn.dataset.view) {
      view = btn.dataset.view;
      render();
      return;
    }
    if (btn.dataset.mode && r) {
      patch(id, { tab: btn.dataset.mode });
      render();
      focusTab(r);
      return;
    }
    if (btn.dataset.dataset) {
      const k = btn.dataset.dataset;
      activate(k, k === "practice" ? sample : imports()[k]);
      return;
    }
    if (btn.dataset.use && modalRow) {
      const item = data.evidence.find((e) => e.id === btn.dataset.use),
        line = rowBy(modalRow);
      if (!item || !line) return;
      const citation = item.source + " " + item.id + " · " + item.title,
        path = receiptPath(item);
      if (path) {
        btn.disabled = true;
        const res = await fetch(path, {
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
        if (!res.ok) throw Error("Receipt file is unavailable.");
        await attach(line, await res.blob(), path.split("/").pop(), citation);
      } else {
        const st = lineState(line),
          val = draft(line).source || "";
        patch(line.id, {
          expanded: true,
          draft: {
            ...st.draft,
            source: [
              ...new Set([...val.split("\n").filter(Boolean), citation]),
            ].join("\n"),
          },
        });
        render();
      }
      modal.close();
      notify("Evidence saved to " + line.id + ".");
      return;
    }
    if (act === "close") modal.close();
    if (act === "datasets") datasets();
    if (act === "report") {
      view = "review";
      render();
      $("#app").scrollIntoView({ block: "start" });
    }
    if (act === "evidence" || act === "row-evidence") evidence(r?.id || "");
    if (act === "line-detail" && r) rowDetails(r);
    if (act === "ok" && r) reconcile(r);
    if (act === "undo" && r) {
      patch(id, { done: null });
      render();
      notify(id + " returned to the open queue.");
    }
    if (act === "download" && r) await download(r);
    if (act === "note" && r) {
      const val = clean(draft(r).note);
      if (!val)
        return fail(
          r,
          "Write the tentative explanation or question first.",
          "note",
        );
      patch(id, { note: val });
      render();
      notify("Review note saved. " + id + " is still open.");
    }
  }
  function errorNotice(e) {
    notify(
      e?.name === "QuotaExceededError"
        ? "Browser storage is full. Your latest change could not be saved."
        : e?.message || "Could not save this change.",
    );
  }
  document.addEventListener("click", (e) => {
    clicked(e).catch(errorNotice);
  });
  document.addEventListener("input", (e) => {
    if (!data) return;
    if (e.target.id === "search") {
      q = key(e.target.value);
      render();
      return;
    }
    const id = e.target.closest("[data-row]")?.dataset.row,
      k = e.target.dataset.field;
    if (id && k) {
      try {
        patch(id, {
          draft: { ...lineState(rowBy(id)).draft, [k]: e.target.value },
        });
        const err = document.getElementById(id + "-error");
        if (err) err.textContent = "";
      } catch (err) {
        errorNotice(err);
      }
    }
  });
  document.addEventListener("change", async (e) => {
    if (!data) return;
    try {
      if (e.target.id === "compact") {
        s.compact = e.target.checked;
        save();
        render();
      }
      if (e.target.id === "suggest") {
        s.suggest = e.target.checked;
        save();
        render();
      }
      if (e.target.id === "only-notes") {
        onlyNotes = e.target.checked;
        render();
      }
      if (e.target.id === "import-json") await importJSON(e.target.files[0]);
      if (e.target.dataset.fileRow && e.target.files[0]) {
        const file = e.target.files[0];
        await attach(rowBy(e.target.dataset.fileRow), file, file.name);
        notify("Receipt saved on this device.");
      }
      if (e.target.dataset.field === "matchId") {
        const id = e.target.closest("[data-row]").dataset.row;
        patch(id, {
          draft: { ...lineState(rowBy(id)).draft, matchId: e.target.value },
        });
        render();
        document
          .getElementById(id + "-matchId")
          ?.focus({ preventScroll: true });
      }
    } catch (err) {
      errorNotice(err);
    }
  });
  document.addEventListener(
    "toggle",
    (e) => {
      if (
        !data ||
        !e.target.isConnected ||
        !e.target.matches?.("[data-details]")
      )
        return;
      const id = e.target.closest("[data-row]").dataset.row;
      if (!!lineState(rowBy(id)).expanded !== e.target.open) {
        try {
          patch(id, { expanded: e.target.open });
        } catch (err) {
          errorNotice(err);
        }
      }
    },
    true,
  );
  window.addEventListener("storage", (e) => {
    if (data && e.key === stateKey() && e.newValue) {
      s = JSON.parse(e.newValue);
      render();
    }
  });
  (async () => {
    const res = await fetch("./sample.json", { credentials: "omit" });
    if (!res.ok) throw Error("Practice statement could not be loaded.");
    sample = validate(await res.json());
    const prev = get(prefix + "active", "practice"),
      obj = prev === "practice" ? null : imports()[prev];
    activate(obj ? prev : "practice", obj || sample);
  })().catch((e) => {
    app.innerHTML =
      '<p class="empty">Unable to open this sandbox. ' +
      esc(e.message) +
      " Reload the page with browser storage enabled.</p>";
  });
})();
