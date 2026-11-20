// Käyttöliittymä. Potilasteksti pidetään vain muistissa: ei localStorage-,
// sessionStorage-, IndexedDB- tai verkkokäyttöä syötteelle tai luonnokselle.
// Pysyvästi tallennetaan vain fraasikirjasto ja asetukset.

import { TASKS, detectIntent, taskLabel } from "./core/intent.js";
import { compose, sectionText, checkText, DEFAULT_HEADINGS } from "./core/compose.js";
import { fidelityIssues } from "./core/checks.js";
import { extractFacts, CATEGORY_LABEL, ORIGIN_LABEL } from "./core/extract.js";
import { BC_PURPOSES, detectPurpose } from "./core/bc-purposes.js";
import {
  EXAMPLE_PHRASES, PURPOSES, PHRASE_REGIONS, searchPhrases, upsertPhrase, deletePhrase, exportPhrases, importPhrases,
  applyStatusPhrase, suggestPhrases, newId,
} from "./core/phrases.js";
import { NO_MODEL, capabilities } from "./core/model.js";

/** @typedef {import("./core/compose.js").Draft} Draft */
/** @typedef {import("./core/checks.js").Issue} Issue */
/** @typedef {import("./core/phrases.js").Phrase} Phrase */
/** @typedef {{ id: string, heading: string, text: string, fixed?: boolean }} EditableSection */

const PHRASE_KEY = "laakari-avustaja.fraasit.v1";
const SETTINGS_KEY = "laakari-avustaja.asetukset.v1";

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = /** @type {HTMLTextAreaElement} */ ($("input"));

const state = {
  /** @type {import("./core/intent.js").TaskId | null} */ task: null,
  userPickedTask: false,
  /** @type {string} */ purposeId: "",
  userPickedPurpose: false,
  /** @type {Record<string, string>} */ answers: {},
  /** @type {import("./core/extract.js").Fact[]} */ phraseFacts: [],
  /** @type {{ kind: string, message: string }[]} */ phraseNotes: [],
  /** @type {Draft | null} */ draft: null,
  /** @type {EditableSection[]} */ sections: [],
  /** @type {EditableSection[][]} */ history: [],
  /** @type {Set<string>} */ acks: new Set(),
  /** @type {Issue[]} */ liveIssues: [],
  /** @type {Phrase[]} */ phrases: loadPhrases(),
  settings: loadSettings(),
  /** @type {string | null} */ selectedPhrase: null,
};

// ---------- Tallennus (vain fraasit ja asetukset) ----------
function loadPhrases() {
  try {
    const raw = localStorage.getItem(PHRASE_KEY);
    if (raw) {
      const r = importPhrases([], raw, { keepVerification: true });
      if (r.list.length) return r.list;
    }
  } catch { /* yksityinen tila tai estetty tallennus */ }
  return structuredClone(EXAMPLE_PHRASES);
}
function savePhrases() {
  try { localStorage.setItem(PHRASE_KEY, exportPhrases(state.phrases)); } catch { /* ei tallennusta */ }
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (Array.isArray(s.headings) && s.headings.every((/** @type {any} */ h) => typeof h.id === "string" && typeof h.label === "string")) {
        return { headings: s.headings.map((/** @type {any} */ h) => ({ id: h.id, label: String(h.label).slice(0, 60), enabled: !!h.enabled })) };
      }
    }
  } catch { /* oletukset */ }
  return { headings: structuredClone(DEFAULT_HEADINGS) };
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); } catch { /* ei tallennusta */ }
}

// ---------- Apurit ----------
/** @param {string} tag @param {Record<string, any>} [attrs] @param {(Node|string|null|undefined|false)[]} [children] */
function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "className") el.className = v;
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

/** Kopiointi: Clipboard API tai varakeino (iPadin http-lähiverkossa Clipboard API ei ole käytössä). @param {string} text */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* varakeino alla */ }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.append(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand("copy"); } catch { ok = false; }
  ta.remove();
  return ok;
}

/** @param {string} msg */
function flash(msg) {
  const s = $("copy-status");
  s.textContent = msg;
  setTimeout(() => { if (s.textContent === msg) s.textContent = ""; }, 2500);
}

/** Näyttää syötteen kohdan (lähdekohta). @param {number} start @param {number} end */
function showInInput(start, end) {
  if (start < 0) return;
  input.focus();
  input.setSelectionRange(start, end);
  // Vieritä valinta näkyviin.
  const before = input.value.slice(0, start);
  const lines = before.split("\n").length;
  const lh = parseFloat(getComputedStyle(input).lineHeight) || 22;
  input.scrollTop = Math.max(0, (lines - 3) * lh);
}

// ---------- Tehtävän ehdotus ----------
let intentTimer = 0;
function onInput() {
  clearTimeout(intentTimer);
  intentTimer = window.setTimeout(updateIntent, 180);
}

function updateIntent() {
  const r = detectIntent(input.value);
  const hint = $("task-hint");
  if (!state.userPickedTask) {
    state.task = r.status === "selvä" ? r.candidates[0]?.task ?? null : null;
  }
  if (!state.userPickedPurpose) state.purposeId = detectPurpose(input.value)?.id ?? "";
  if (r.status === "tyhjä") hint.textContent = "Kirjoita tai liitä teksti – ehdotan tehtävää.";
  else if (state.userPickedTask && state.task) hint.replaceChildren("Valittu tehtävä: ", h("strong", { text: taskLabel(state.task) }), ".");
  else if (r.status === "selvä" && state.task) {
    hint.replaceChildren("Ehdotettu tehtävä: ", h("strong", { text: taskLabel(state.task) }), ` (tunnistettu: ${r.candidates[0]?.reason}). Vaihda yhdellä painalluksella.`);
  } else {
    hint.replaceChildren("Tarkoitus jäi epäselväksi. Todennäköisimmät: ", h("strong", { text: r.candidates.map((c) => taskLabel(c.task)).join(" · ") }), ". Valitse tehtävä.");
  }
  renderChips(new Set(r.candidates.map((c) => c.task)));
  renderPurpose();
  renderPhraseSuggestions();
}

/** @param {Set<string>} suggested */
function renderChips(suggested) {
  const box = $("task-chips");
  box.replaceChildren(
    ...TASKS.map((t, i) =>
      h("button", {
        type: "button",
        className: `chip${suggested.has(t.id) ? " suggested" : ""}`,
        role: "radio",
        "aria-checked": String(state.task === t.id),
        title: `${t.label} (Alt+${i + 1})`,
        onclick: () => pickTask(t.id),
      }, [t.short, h("span", { className: "n", text: String(i + 1) })]),
    ),
  );
}

/** @param {import("./core/intent.js").TaskId} id */
function pickTask(id) {
  state.task = id;
  state.userPickedTask = true;
  updateIntent();
  if (state.draft) generate();
}

function renderPurpose() {
  const row = $("purpose-row");
  row.hidden = state.task !== "bc";
  const sel = /** @type {HTMLSelectElement} */ ($("purpose"));
  if (sel.options.length === 0) {
    sel.append(h("option", { value: "", text: "— valitse käyttötarkoitus —" }), ...BC_PURPOSES.map((p) => h("option", { value: p.id, text: p.label })));
  }
  sel.value = state.purposeId;
}

function renderPhraseSuggestions() {
  const existing = document.getElementById("phrase-suggest");
  existing?.remove();
  const list = suggestPhrases(state.phrases, input.value).filter((p) => p.purpose === "status" || state.task === "kertomus");
  if (!list.length || !input.value.trim()) return;
  const box = h("div", { id: "phrase-suggest", className: "small" }, [
    "Sopivat vahvistetut fraasit: ",
    ...list.slice(0, 4).map((p) => h("button", { type: "button", className: "chip", onclick: () => openPhrases(p.id) }, [p.title])),
  ]);
  $("needs").before(box);
}

// ---------- Luonnos ----------
function generate() {
  const needsBox = $("needs");
  if (!state.task) {
    needsBox.className = "needs";
    needsBox.replaceChildren(h("p", { text: "Valitse ensin tehtävä yllä olevista vaihtoehdoista." }));
    return;
  }
  const draft = compose({
    task: state.task,
    input: input.value,
    ...(state.purposeId ? { purposeId: state.purposeId } : {}),
    answers: state.answers,
    phraseFacts: state.phraseFacts,
    headings: state.settings.headings,
  });
  for (const n of state.phraseNotes) draft.issues.push({ id: `fraasi-${n.message.length}-${n.kind}`, kind: n.kind === "puoli" ? "ristiriita" : "huomio", message: n.message, factIds: [], blocking: false });
  if (state.sections.length) state.history.push(state.sections.map((s) => ({ ...s })));
  state.draft = draft;
  state.sections = draft.sections.map((s) => ({ id: s.id, heading: s.heading, text: sectionText(s), ...(s.fixed ? { fixed: true } : {}) }));
  state.acks = new Set([...state.acks].filter((id) => draft.issues.some((i) => i.id === id)));
  renderNeeds();
  renderDraft();
  refreshChecks();
}

function renderNeeds() {
  const box = $("needs");
  const d = state.draft;
  box.replaceChildren();
  box.className = "needs";
  if (!d || d.needs.length === 0) return;
  for (const n of d.needs) {
    if (n.kind === "separate") {
      box.className = "needs stop";
      box.append(h("p", { text: "Yhdistely pysäytetty" }), h("div", { text: n.question }));
    } else if (n.kind === "purpose") {
      box.append(h("p", { text: n.question }), h("div", { className: "opts" }, (n.options ?? []).map((o) =>
        h("button", { type: "button", onclick: () => { state.purposeId = o.id; state.userPickedPurpose = true; renderPurpose(); generate(); } }, [o.label]))));
    } else if (n.kind === "question" && n.field) {
      const field = n.field;
      const inp = /** @type {HTMLInputElement} */ (h("input", { type: "text", id: `answer-${field}`, value: state.answers[field] ?? "", "aria-label": n.question }));
      const apply = () => { state.answers[field] = inp.value; generate(); };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } });
      box.append(h("p", { text: n.question }), h("div", { className: "row" }, [inp, h("button", { type: "button", onclick: apply }, ["Lisää"])]));
    } else {
      box.append(h("p", { text: n.question }));
    }
  }
}

function renderDraft() {
  const d = state.draft;
  const box = $("draft");
  const info = $("draft-info");
  info.replaceChildren(...(d ? [h("p", { text: d.title }), ...d.info.map((t) => h("p", { text: t }))] : []));
  if (!d || state.sections.length === 0) {
    box.replaceChildren(h("p", { className: "empty", text: d?.blocked ? "Luonnosta ei muodostettu – katso ohje syötteen alla." : "Luonnos näkyy tässä muokattavana tekstinä." }));
    updateApproval();
    return;
  }
  box.replaceChildren(...state.sections.map((s, idx) => sectionView(s, idx)));
  for (const ta of box.querySelectorAll("textarea")) autosize(/** @type {HTMLTextAreaElement} */ (ta));
  /** @type {HTMLButtonElement} */ ($("undo-version")).disabled = state.history.length === 0;
  renderSources();
  updateApproval();
}

/** @param {EditableSection} s @param {number} idx */
function sectionView(s, idx) {
  const orig = state.draft?.sections.find((x) => x.id === s.id);
  const ta = /** @type {HTMLTextAreaElement} */ (h("textarea", { "aria-label": s.heading, "data-section": s.id, spellcheck: "true" }));
  ta.value = s.text;
  let snapTimer = 0;
  ta.addEventListener("input", () => {
    autosize(ta);
    if (!snapTimer) state.history.push(state.sections.map((x) => ({ ...x })));
    clearTimeout(snapTimer);
    snapTimer = window.setTimeout(() => { snapTimer = 0; }, 1500);
    state.sections[idx] = { ...s, text: ta.value };
    s.text = ta.value;
    wrap.classList.toggle("has-ph", /\[[^\]]+\]/.test(ta.value));
    /** @type {HTMLButtonElement} */ ($("undo-version")).disabled = false;
    refreshChecks();
  });
  const provList = h("ul", { className: "prov", hidden: true });
  for (const l of orig?.lines ?? []) {
    const facts = l.factIds.map((id) => state.draft?.facts.find((f) => f.id === id)).filter((f) => f !== undefined);
    const origin = /** @type {string} */ (l.origin);
    provList.append(h("li", {}, [
      h("span", { className: `origin ${origin}`, text: origin === "pohja" ? (l.placeholder ? "täydennettävä" : "pohjateksti") : ORIGIN_LABEL[/** @type {keyof typeof ORIGIN_LABEL} */ (origin)] }),
      h("span", { text: l.text.length > 90 ? `${l.text.slice(0, 90)}…` : l.text }),
      ...facts.filter((f) => f && f.start >= 0).slice(0, 4).map((f) =>
        h("button", { type: "button", title: `${CATEGORY_LABEL[f.category]}: ”${f.text}”`, onclick: () => showInInput(f.start, f.end) }, ["Näytä syötteessä"])),
      ...facts.filter((f) => f && f.id.startsWith("a-")).map(() => h("span", { className: "small", text: "(tarkennukseen annettu vastaus)" })),
    ]));
  }
  if (orig && s.text !== sectionText(orig)) provList.append(h("li", { className: "small", text: "Osiota on muokattu; lähdekohdat koskevat alkuperäistä luonnosta." }));
  const wrap = h("div", { className: `section${/\[[^\]]+\]/.test(s.text) ? " has-ph" : ""}`, "data-section": s.id }, [
    h("div", { className: "section-head" }, [
      h("h3", { text: s.heading }),
      h("div", { className: "section-tools" }, [
        h("button", { type: "button", "aria-expanded": "false", onclick: (/** @type {Event} */ e) => {
          const b = /** @type {HTMLButtonElement} */ (e.currentTarget);
          provList.hidden = !provList.hidden;
          b.setAttribute("aria-expanded", String(!provList.hidden));
        } }, ["Lähteet"]),
        h("button", { type: "button", className: "copy-section", onclick: async () => {
          if (!canCopy()) { flash("Hyväksy luonnos ennen kopiointia."); return; }
          flash((await copyText(`${s.heading}\n${s.text}`)) ? `Kopioitu: ${s.heading}` : "Kopiointi epäonnistui");
        } }, ["Kopioi"]),
      ]),
    ]),
    ta,
    provList,
  ]);
  return wrap;
}

/** @param {HTMLTextAreaElement} ta */
function autosize(ta) {
  ta.style.height = "auto";
  ta.style.height = `${ta.scrollHeight + 2}px`;
}

function fullText() {
  return state.sections.map((s) => `${s.heading}\n${s.text}`).join("\n\n");
}

// ---------- Tarkistukset ----------
function refreshChecks() {
  const d = state.draft;
  if (!d) return;
  const staticIssues = d.issues.filter((i) => i.kind !== "ero");
  const live = state.sections.length ? fidelityIssues(checkText(state.sections), d.facts) : [];
  state.liveIssues = [...staticIssues, ...live];
  renderChecks();
  updateApproval();
}

function renderChecks() {
  const ul = $("checks");
  const issues = state.liveIssues;
  const placeholders = (fullText().match(/\[[^\]]+\]/g) ?? []).length;
  /** @type {HTMLElement[]} */
  const items = [];
  if (placeholders > 0) items.push(h("li", { className: "check puuttuu" }, [h("span", { className: "kind", text: "Täydennettävää:" }), `${placeholders} hakasulkeissa olevaa kohtaa. Täydennä tai poista ne ennen hyväksyntää.`]));
  const order = { pysäytys: 0, ristiriita: 1, ero: 2, puuttuu: 3, epävarma: 4, huomio: 5 };
  for (const i of [...issues].sort((a, b) => order[a.kind] - order[b.kind] || Number(b.blocking) - Number(a.blocking))) {
    const facts = i.factIds.map((id) => state.draft?.facts.find((f) => f.id === id)).filter((f) => f && f.start >= 0);
    items.push(h("li", { className: `check ${i.kind}${i.blocking ? " blocking" : ""}`, "data-issue": i.id }, [
      h("span", { className: "kind", text: `${KIND_LABEL[i.kind]}:` }),
      i.message,
      facts.length ? h("div", {}, facts.slice(0, 3).map((f) => h("button", { type: "button", className: "jump", onclick: () => f && showInInput(f.start, f.end) }, [`Näytä: ”${(f?.text ?? "").slice(0, 30)}”`]))) : null,
      i.blocking && i.kind !== "pysäytys"
        ? h("label", { className: "ack" }, [
            (() => {
              const cb = /** @type {HTMLInputElement} */ (h("input", { type: "checkbox", "data-ack": i.id }));
              cb.checked = state.acks.has(i.id);
              cb.addEventListener("change", () => { if (cb.checked) state.acks.add(i.id); else state.acks.delete(i.id); updateApproval(); });
              return cb;
            })(),
            "Tarkistettu: korjasin luonnoksen tai ero on tarkoituksellinen",
          ])
        : null,
    ]));
  }
  if (items.length === 0) items.push(h("li", { className: "check ok", text: "Ei havaittuja puutteita tai eroja lähteeseen. Lääkäri tarkistaa silti koko tekstin." }));
  ul.replaceChildren(...items);
}

const KIND_LABEL = { pysäytys: "Pysäytys", ristiriita: "Ristiriita", ero: "Ero lähteeseen", puuttuu: "Puuttuu", epävarma: "Epävarma", huomio: "Huomio" };

function renderSources() {
  const d = state.draft;
  const box = $("sources");
  box.replaceChildren();
  if (!d?.sourceLinks.length) return;
  box.append(h("strong", { text: "Pohjan lähde" }));
  for (const l of d.sourceLinks) box.append(h("p", {}, [h("a", { href: l.url, target: "_blank", rel: "noopener noreferrer" }, [l.label])]));
}

function blockingOpen() {
  return state.liveIssues.filter((i) => i.blocking && !state.acks.has(i.id));
}

function updateApproval() {
  const cb = /** @type {HTMLInputElement} */ ($("approve"));
  const has = state.sections.length > 0 && !state.draft?.blocked;
  const ph = /\[[^\]]+\]/.test(fullText());
  const ok = has && !ph && blockingOpen().length === 0;
  cb.disabled = !ok;
  if (!ok) cb.checked = false;
  cb.parentElement?.setAttribute("title", !has ? "Muodosta luonnos ensin" : ph ? "Täydennä tai poista hakasulkeissa olevat kohdat" : blockingOpen().length ? "Kuittaa punaiset tarkistukset" : "");
  /** @type {HTMLButtonElement} */ ($("copy-all")).disabled = !cb.checked;
}

function canCopy() {
  return /** @type {HTMLInputElement} */ ($("approve")).checked;
}

function undoVersion() {
  const prev = state.history.pop();
  if (!prev) return;
  state.sections = prev;
  renderDraft();
  refreshChecks();
  /** @type {HTMLButtonElement} */ ($("undo-version")).disabled = state.history.length === 0;
  flash("Edellinen versio palautettu");
}

function clearAll() {
  input.value = "";
  Object.assign(state, { task: null, userPickedTask: false, purposeId: "", userPickedPurpose: false, answers: {}, phraseFacts: [], phraseNotes: [], draft: null, sections: [], history: [], acks: new Set(), liveIssues: [] });
  $("needs").replaceChildren();
  $("checks").replaceChildren(h("li", { className: "empty", text: "Tarkistukset näkyvät luonnoksen muodostamisen jälkeen." }));
  $("sources").replaceChildren();
  renderDraft();
  updateIntent();
  input.focus();
}

// ---------- Fraasikirjasto ----------
const phrasesDialog = /** @type {HTMLDialogElement} */ ($("phrases-dialog"));

/** @param {string} [id] */
function openPhrases(id) {
  if (id) state.selectedPhrase = id;
  const fp = /** @type {HTMLSelectElement} */ ($("phrase-filter-purpose"));
  const fr = /** @type {HTMLSelectElement} */ ($("phrase-filter-region"));
  if (fp.options.length === 0) {
    fp.append(h("option", { value: "", text: "Kaikki käyttötarkoitukset" }), ...PURPOSES.map((p) => h("option", { value: p, text: p })));
    fr.append(h("option", { value: "", text: "Kaikki alueet" }), ...PHRASE_REGIONS.map((r) => h("option", { value: r, text: r })));
  }
  renderPhraseList();
  if (!phrasesDialog.open) phrasesDialog.showModal();
}

function renderPhraseList() {
  const list = searchPhrases(state.phrases, {
    query: /** @type {HTMLInputElement} */ ($("phrase-search")).value,
    purpose: /** @type {HTMLSelectElement} */ ($("phrase-filter-purpose")).value,
    region: /** @type {HTMLSelectElement} */ ($("phrase-filter-region")).value,
  });
  $("phrase-list").replaceChildren(...list.map((p) => h("li", {}, [
    h("button", { type: "button", "aria-current": String(p.id === state.selectedPhrase), onclick: () => { state.selectedPhrase = p.id; renderPhraseList(); } },
      [`${p.title}`, h("br"), h("span", { className: "small", text: `${p.purpose} · ${p.region}${p.verified ? " · vahvistettu" : " · EI vahvistettu"}` })]),
  ])));
  renderPhraseDetail();
}

function renderPhraseDetail() {
  const box = $("phrase-detail");
  const p = state.phrases.find((x) => x.id === state.selectedPhrase);
  if (!p) { box.replaceChildren(h("p", { className: "empty", text: "Valitse fraasi tai luo uusi." })); return; }
  const title = /** @type {HTMLInputElement} */ (h("input", { type: "text", value: p.title, id: "pd-title" }));
  const purpose = /** @type {HTMLSelectElement} */ (h("select", { id: "pd-purpose" }, PURPOSES.map((x) => h("option", { value: x, text: x }))));
  purpose.value = p.purpose;
  const region = /** @type {HTMLSelectElement} */ (h("select", { id: "pd-region" }, PHRASE_REGIONS.map((x) => h("option", { value: x, text: x }))));
  region.value = PHRASE_REGIONS.includes(p.region) ? p.region : "yleinen";
  const text = /** @type {HTMLTextAreaElement} */ (h("textarea", { id: "pd-text" }));
  text.value = p.text;
  const findings = /** @type {HTMLTextAreaElement} */ (h("textarea", { id: "pd-findings" }));
  findings.value = p.findings.map((f) => f.text).join("\n");
  const verified = /** @type {HTMLInputElement} */ (h("input", { type: "checkbox", id: "pd-verified" }));
  verified.checked = p.verified;
  const save = () => {
    const lines = findings.value.split("\n").map((t) => t.trim()).filter(Boolean);
    const updated = {
      ...p, title: title.value, purpose: purpose.value, region: region.value, text: text.value,
      findings: lines.map((t, i) => ({ id: p.findings.find((f) => f.text === t)?.id ?? `l${Date.now().toString(36)}${i}`, text: t })),
      verified: verified.checked, updated: new Date().toISOString().slice(0, 10),
    };
    try {
      state.phrases = upsertPhrase(state.phrases, updated);
      savePhrases();
      renderPhraseList();
      flash("Fraasi tallennettu");
    } catch (e) { flash(e instanceof Error ? e.message : "Tallennus epäonnistui"); }
  };
  box.replaceChildren(
    h("label", { for: "pd-title", text: "Nimi" }), title,
    h("label", { for: "pd-purpose", text: "Käyttötarkoitus" }), purpose,
    h("label", { for: "pd-region", text: "Anatominen alue" }), region,
    h("label", { for: "pd-text", text: "Teksti (muut kuin statusfraasit)" }), text,
    h("label", { for: "pd-findings", text: "Statuslöydökset – yksi löydös per rivi (vahvistetaan käytössä yksitellen)" }), findings,
    h("label", {}, [verified, " Olen tarkistanut ja vahvistan tämän fraasin sanamuodon"]),
    h("div", { className: "row" }, [
      h("button", { type: "button", className: "primary", id: "pd-save", onclick: save }, ["Tallenna"]),
      h("button", { type: "button", onclick: () => { if (confirm(`Poistetaanko fraasi ”${p.title}”?`)) { state.phrases = deletePhrase(state.phrases, p.id); state.selectedPhrase = null; savePhrases(); renderPhraseList(); } } }, ["Poista"]),
    ]),
    applyBox(p),
  );
}

/** @param {Phrase} p */
function applyBox(p) {
  if (p.findings.length === 0) {
    return h("div", { className: "apply-box" }, [
      h("strong", { text: "Käytä luonnoksessa" }),
      !p.verified ? h("p", { className: "notice", text: "Fraasia ei ole vahvistettu. Vahvista sanamuoto ennen käyttöä." }) : null,
      h("div", { className: "row" }, [h("button", { type: "button", disabled: !p.text, onclick: () => insertTextPhrase(p) }, ["Lisää luonnokseen"])]),
    ]);
  }
  const checks = p.findings.map((f) => {
    const cb = /** @type {HTMLInputElement} */ (h("input", { type: "checkbox", value: f.id, "data-finding": f.id }));
    return h("li", {}, [h("label", {}, [cb, ` ${f.text}`])]);
  });
  const side = /** @type {HTMLSelectElement} */ (h("select", { id: "pd-side", "aria-label": "Puoli" }, [
    h("option", { value: "", text: "Puoli: ei puolisuutta" }), h("option", { value: "oikea", text: "Oikea" }), h("option", { value: "vasen", text: "Vasen" }),
  ]));
  const sideFromInput = extractFacts(input.value).flatMap((f) => f.regions.includes(p.region) ? f.sides : []).find((s) => s !== "molemmat");
  if (sideFromInput) side.value = sideFromInput;
  const ul = h("ul", { className: "findings" }, checks);
  return h("div", { className: "apply-box" }, [
    h("strong", { text: "Vahvista tutkitut löydökset" }),
    h("p", { className: "small", text: "Fraasin valinta ei vahvista, että tutkimukset on tehty. Rastita vain ne löydökset, jotka tutkit tällä käynnillä. Syötteen poikkeava löydös korvaa ristiriitaisen normaalilöydöksen." }),
    !p.verified ? h("p", { className: "notice", text: "Fraasia ei ole vahvistettu – se merkitään tarkistettavaksi." }) : null,
    ul,
    h("div", { className: "row" }, [side, h("button", { type: "button", className: "primary", id: "pd-apply", onclick: () => {
      const ids = [...ul.querySelectorAll("input:checked")].map((x) => /** @type {HTMLInputElement} */ (x).value);
      if (ids.length === 0) { flash("Rastita vähintään yksi tutkittu löydös."); return; }
      const r = applyStatusPhrase(p, ids, /** @type {any} */ (side.value), extractFacts(input.value));
      state.phraseFacts = [...state.phraseFacts.filter((f) => !f.id.startsWith(`fr-${p.id}-`)), ...r.facts];
      state.phraseNotes = [...state.phraseNotes, ...r.notes];
      phrasesDialog.close();
      if (state.task) generate();
      flash(`${r.facts.length} löydöstä lisätty statukseen${r.notes.length ? " – katso huomiot" : ""}`);
    } }, ["Lisää rastitut löydökset statukseen"])]),
  ]);
}

/** @param {Phrase} p */
function insertTextPhrase(p) {
  const cat = p.purpose === "suunnitelma" || p.purpose === "potilasohje" ? "suunnitelma" : p.purpose === "esitiedot" ? "potilaan_kertoma" : "havainto";
  state.phraseFacts = [...state.phraseFacts, {
    id: `fr-${p.id}-t${state.phraseFacts.length}`, text: p.text, start: -1, end: -1, category: /** @type {any} */ (cat), origin: "fraasi",
    negated: false, uncertain: false, sides: [], regions: [], numbers: [],
  }];
  if (!p.verified) state.phraseNotes.push({ kind: "vahvistamaton", message: `Fraasi ”${p.title}” ei ole vahvistettu – tarkista sanamuoto.` });
  phrasesDialog.close();
  if (state.task) generate();
}

function newPhrase() {
  const p = { id: newId(), title: "Uusi fraasi", purpose: "status", region: "yleinen", text: "", findings: [{ id: "l1", text: "Löydös" }], verified: false, updated: new Date().toISOString().slice(0, 10) };
  state.phrases = upsertPhrase(state.phrases, p);
  state.selectedPhrase = p.id;
  savePhrases();
  renderPhraseList();
}

function exportFile() {
  const blob = new Blob([exportPhrases(state.phrases)], { type: "application/json" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `fraasit-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  /** @type {HTMLAnchorElement} */ (a).click();
  setTimeout(() => { URL.revokeObjectURL(/** @type {HTMLAnchorElement} */ (a).href); a.remove(); }, 1000);
}

/** @param {Event} e */
async function importFile(e) {
  const inp = /** @type {HTMLInputElement} */ (e.target);
  const file = inp.files?.[0];
  if (!file) return;
  if (file.size > 2_000_000) { flash("Tiedosto on liian suuri (yli 2 Mt)."); return; }
  const keep = /** @type {HTMLInputElement} */ ($("phrase-keep-verified")).checked;
  const r = importPhrases(state.phrases, await file.text(), { keepVerification: keep });
  state.phrases = r.list;
  savePhrases();
  renderPhraseList();
  flash(`Tuotu: ${r.added} uutta, ${r.updated} päivitetty${r.errors.length ? `, ${r.errors.length} virhettä` : ""}${keep ? "" : " – vahvista tuodut fraasit"}`);
  inp.value = "";
}

// ---------- Asetukset ----------
function openSettings() {
  renderHeadings();
  $("capabilities").replaceChildren(...capabilities(NO_MODEL).map((c) => h("li", {}, [h("strong", { text: `${c.feature}: ` }), c.mode])));
  /** @type {HTMLDialogElement} */ ($("settings-dialog")).showModal();
}

function renderHeadings() {
  const hs = state.settings.headings;
  $("heading-list").replaceChildren(...hs.map((hd, i) => {
    const cb = /** @type {HTMLInputElement} */ (h("input", { type: "checkbox", "aria-label": `Käytä otsikkoa ${hd.label}` }));
    cb.checked = hd.enabled;
    cb.addEventListener("change", () => { hd.enabled = cb.checked; saveSettings(); });
    const name = /** @type {HTMLInputElement} */ (h("input", { type: "text", value: hd.label, "aria-label": "Otsikon nimi" }));
    name.addEventListener("change", () => { hd.label = name.value.trim() || hd.label; saveSettings(); });
    const move = (/** @type {number} */ d) => { const j = i + d; if (j < 0 || j >= hs.length) return; [hs[i], hs[j]] = [/** @type {any} */ (hs[j]), /** @type {any} */ (hs[i])]; saveSettings(); renderHeadings(); };
    return h("li", {}, [cb, name, h("button", { type: "button", "aria-label": "Ylös", onclick: () => move(-1) }, ["↑"]), h("button", { type: "button", "aria-label": "Alas", onclick: () => move(1) }, ["↓"])]);
  }));
}

// ---------- Kytkennät ----------
input.addEventListener("input", onInput);
$("generate").addEventListener("click", generate);
$("clear").addEventListener("click", clearAll);
$("undo-version").addEventListener("click", undoVersion);
$("purpose").addEventListener("change", (e) => { state.purposeId = /** @type {HTMLSelectElement} */ (e.target).value; state.userPickedPurpose = true; if (state.draft) generate(); });
$("approve").addEventListener("change", updateApproval);
$("copy-all").addEventListener("click", async () => {
  if (!canCopy()) return;
  flash((await copyText(fullText())) ? "Koko teksti kopioitu" : "Kopiointi epäonnistui – valitse teksti ja kopioi käsin");
});
$("open-phrases").addEventListener("click", () => openPhrases());
$("open-settings").addEventListener("click", openSettings);
$("model-badge").addEventListener("click", openSettings);
$("open-help").addEventListener("click", () => /** @type {HTMLDialogElement} */ ($("help-dialog")).showModal());
$("phrase-search").addEventListener("input", renderPhraseList);
$("phrase-filter-purpose").addEventListener("change", renderPhraseList);
$("phrase-filter-region").addEventListener("change", renderPhraseList);
$("phrase-new").addEventListener("click", newPhrase);
$("phrase-export").addEventListener("click", exportFile);
$("phrase-import").addEventListener("change", importFile);
$("settings-dialog").addEventListener("close", () => { if (state.draft && state.task === "kertomus") generate(); });

document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key === "Enter") { e.preventDefault(); generate(); return; }
  if (mod && e.shiftKey && (e.key === "C" || e.key === "c")) {
    e.preventDefault();
    /** @type {HTMLButtonElement} */ ($("copy-all")).click();
    return;
  }
  if (mod && e.altKey && (e.key === "z" || e.key === "Z")) { e.preventDefault(); undoVersion(); return; }
  if (e.altKey && !mod) {
    const n = Number(e.code.replace("Digit", ""));
    if (e.code.startsWith("Digit") && n >= 1 && n <= TASKS.length) { e.preventDefault(); const t = TASKS[n - 1]; if (t) pickTask(t.id); return; }
    if (e.code === "KeyF") { e.preventDefault(); openPhrases(); return; }
    if (e.code === "KeyI") { e.preventDefault(); input.focus(); return; }
    if (e.code === "Delete") { e.preventDefault(); clearAll(); }
  }
});

updateIntent();
renderDraft();
input.focus();
