// Luonnoksen muodostus rakenteisesta välituloksesta asiakirjapohjan mukaan.
// Sääntöpohjainen: lauseet tulevat lähteestä, aukot jäävät näkyviksi täydennyskohdiksi.

import { extractFacts, referralTarget, referralQuestion, visibleLabel } from "./extract.js";
import { identityIssues, conflictIssues, fidelityIssues } from "./checks.js";
import { detectPurpose, purposeById, BC_PURPOSES, KELA_CHECKED, KELA_PAGE_UPDATED } from "./bc-purposes.js";
import { toSentence, expandSafeAbbreviations, isUncertain, wordDiff } from "./text.js";
import { plainFinding, plainInterpretation, plainPlan } from "./plain.js";
import { taskLabel } from "./intent.js";

/**
 * @typedef {import("./extract.js").Fact} Fact
 * @typedef {import("./checks.js").Issue} Issue
 * @typedef {import("./intent.js").TaskId} TaskId
 * @typedef {{ text: string, factIds: string[], origin: import("./extract.js").Origin | "pohja", placeholder?: boolean }} Line
 * @typedef {{ id: string, heading: string, lines: Line[], joiner: string, fixed?: boolean }} Section
 * @typedef {{ kind: "purpose" | "question" | "separate", field?: string, question: string, options?: { id: string, label: string }[] }} Need
 * @typedef {{
 *   task: TaskId, title: string, sections: Section[], facts: Fact[], issues: Issue[],
 *   needs: Need[], info: string[], blocked: boolean, sourceLinks: { label: string, url: string }[]
 * }} Draft
 * @typedef {{ id: string, label: string, enabled: boolean }} HeadingSetting
 * @typedef {{
 *   task: TaskId, input: string, purposeId?: string, answers?: Record<string, string>,
 *   phraseFacts?: Fact[], headings?: HeadingSetting[]
 * }} ComposeRequest
 */

export const DEFAULT_HEADINGS = /** @type {HeadingSetting[]} */ ([
  { id: "esitiedot", label: "Esitiedot", enabled: true },
  { id: "nykytila", label: "Nykytila", enabled: false },
  { id: "status", label: "Status", enabled: true },
  { id: "arvio", label: "Arvio", enabled: false },
  { id: "suunnitelma", label: "Suunnitelma", enabled: true },
  { id: "yhteenveto", label: "Yhteenveto", enabled: true },
]);

const HETU_RE = /(?<![\p{N}])\d{6}[-+A-FYXWVU]\d{3}[0-9A-FHJ-NPR-Y](?![\p{L}\p{N}])/gu;

/** @param {string} t @param {string[]} [factIds] @param {Line["origin"]} [origin] @returns {Line} */
const ph = (t, factIds = [], origin = "pohja") => ({ text: `[${t}]`, factIds, origin, placeholder: true });

/**
 * Fakta lauseeksi: lyhenteiden varovainen avaus, ei sanaston muutosta.
 * Lähdeasiakirjan lauseet säilytetään sanatarkasti.
 * @param {Fact} f
 * @returns {Line}
 */
function line(f) {
  const base = f.text.replace(HETU_RE, "[henkilötunnus poistettu]");
  const text = f.origin === "lahdeasiakirja" || f.origin === "fraasi" ? toSentence(base) : toSentence(expandSafeAbbreviations(base));
  return { text, factIds: [f.id], origin: f.origin };
}

/**
 * Lauseen alun kirjainkoko lähteen mukaan, kun lause jatkaa edellistä (erisnimet säilyvät).
 * @param {string} source @param {string} sentence
 */
function keepCase(source, sentence) {
  return /^\p{Lu}/u.test(source.trim()) ? sentence : `${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
}

/**
 * Yhdistää peräkkäiset lyhyet muistiinpanofragmentit luettavammaksi lauseeksi
 * (pilkuilla), kun ne ovat samaa luokkaa ja samasta lähteestä. Faktat säilyvät.
 * @param {Fact[]} facts
 * @returns {Line[]}
 */
function lines(facts) {
  /** @type {Line[]} */
  const out = [];
  /** @type {string | undefined} */
  let lastLabel;
  for (const f of facts) {
    const l = line(f);
    const label = visibleLabel(f);
    const newLabel = label !== undefined && label !== lastLabel;
    if (newLabel) l.text = `${label}: ${keepCase(f.text, l.text)}`;
    lastLabel = label;
    const prev = out[out.length - 1];
    const prevFact = facts[facts.indexOf(f) - 1];
    const continues = prevFact !== undefined && prevFact.lineNo === f.lineNo && !prevFact.sentenceEnd && prev?.factIds.at(-1) === prevFact.id;
    if (prev && continues && !newLabel && prev.origin === l.origin && prev.text.length < 200 && !prev.placeholder) {
      prev.text = `${prev.text.replace(/[.]$/, "")}, ${keepCase(f.text, l.text)}`;
      prev.factIds.push(...l.factIds);
    } else out.push(l);
  }
  return out;
}

/**
 * @param {ComposeRequest} req
 * @returns {Draft}
 */
export function compose(req) {
  const answers = req.answers ?? {};
  const facts = [...extractFacts(req.input), ...answerFacts(answers), ...(req.phraseFacts ?? [])];
  const identity = identityIssues(req.input);
  const conflicts = conflictIssues(facts);
  /** @type {Draft} */
  const draft = {
    task: req.task,
    title: taskLabel(req.task),
    sections: [],
    facts,
    issues: [...identity, ...conflicts],
    needs: [],
    info: ["Sääntöpohjainen muotoilu: lauseet on poimittu syötteestä, eikä tekoäly ole analysoinut tekstiä."],
    blocked: false,
    sourceLinks: [],
  };
  if (identity.some((i) => i.blocking)) {
    draft.blocked = true;
    draft.needs.push({ kind: "separate", question: "Erota eri potilaiden aineistot ja liitä kerrallaan vain yhden potilaan tiedot." });
    return draft;
  }
  const content = facts.filter((f) => f.category !== "komento");
  if (content.length === 0 && req.task !== "bc") {
    draft.needs.push({ kind: "question", field: "sisalto", question: "Syötteessä ei ole kirjattavaa sisältöä. Liitä muistiinpanot tai lähdeteksti." });
    draft.blocked = true;
    return draft;
  }
  switch (req.task) {
    case "kertomus":
      buildRecord(draft, content, req.headings ?? DEFAULT_HEADINGS);
      break;
    case "lahete":
      buildReferral(draft, content, req.input, answers);
      break;
    case "bc":
      buildStatement(draft, content, req, answers);
      break;
    case "potilasselitys":
      buildPatientExplanation(draft, content);
      break;
    case "tutkimustiivistelma":
      buildResultSummary(draft, content);
      break;
    case "kieliasu":
      buildLanguage(draft, req.input);
      break;
    case "todistus":
      buildGeneric(draft, content, [
        { id: "kayttotarkoitus", heading: "Todistuksen käyttötarkoitus", answer: "kayttotarkoitus", missing: "TÄYDENNÄ: mihin todistus annetaan" },
        { id: "esitiedot", heading: "Esitiedot", cats: ["perustieto", "potilaan_kertoma"] },
        { id: "status", heading: "Tutkimuslöydökset (lääkärin havainnot)", cats: ["havainto"], missing: "Ei tutkimuslöydöksiä syötteessä – puuttuva tieto ei tarkoita normaalia löydöstä" },
        { id: "tutkimukset", heading: "Tutkimustulokset", cats: ["tutkimustulos"], optional: true },
        { id: "arvio", heading: "Lääkärin arvio", missing: "LÄÄKÄRI KIRJOITTAA: arvio ja johtopäätös" },
        { id: "ajanjakso", heading: "Ajanjakso tai rajoitukset", missing: "LÄÄKÄRI VAHVISTAA: ajanjakso / rajoitukset" },
      ]);
      draft.info.push("A-todistus laaditaan potilastietojärjestelmän lomakkeella; tämä on sen valmistelua helpottava tekstiluonnos.");
      break;
    case "konsultaatio":
      buildGeneric(draft, content, [
        { id: "kohde", heading: "Konsultoitava taho", answer: "kohde", fromTarget: true, missing: "TÄYDENNÄ: kenelle konsultaatio osoitetaan" },
        { id: "kysymys", heading: "Konsultaatiokysymys", answer: "kysymys", fromQuestion: true, missing: "TÄYDENNÄ: mitä konsultilta kysytään" },
        { id: "esitiedot", heading: "Esitiedot", cats: ["perustieto", "potilaan_kertoma"] },
        { id: "status", heading: "Status", cats: ["havainto"], missing: "Ei statuslöydöksiä syötteessä" },
        { id: "tutkimukset", heading: "Tutkimukset", cats: ["tutkimustulos"], optional: true },
        { id: "hoito", heading: "Nykyinen hoito ja suunnitelma", cats: ["suunnitelma"], optional: true },
      ], req.input);
      break;
    case "hoitosuunnitelma":
      buildGeneric(draft, content, [
        { id: "tilanne", heading: "Lähtötilanne", cats: ["perustieto", "potilaan_kertoma", "havainto", "tutkimustulos"] },
        { id: "tavoite", heading: "Tavoite", answer: "tavoite", missing: "TÄYDENNÄ: hoidon tavoite (lääkärin ja potilaan sopima)" },
        { id: "toimet", heading: "Suunnitellut toimet", cats: ["suunnitelma"], missing: "TÄYDENNÄ: sovitut toimet" },
        { id: "seuranta", heading: "Seuranta ja vastuut", missing: "TÄYDENNÄ: seuranta-ajankohta ja vastuuhenkilö" },
      ]);
      break;
  }
  draft.issues.push(...missingIssues(draft));
  draft.issues.push(...fidelityIssues(checkText(draft.sections.map((s) => ({ text: sectionText(s), fixed: s.fixed }))), facts));
  return draft;
}

/** @param {Record<string, string>} answers @returns {Fact[]} */
function answerFacts(answers) {
  return Object.entries(answers)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => ({
      id: `a-${k}`, text: v.trim(), start: -1, end: -1, category: /** @type {const} */ ("komento"), origin: /** @type {const} */ ("kayttaja"),
      negated: false, uncertain: false, sides: [], regions: [], numbers: [], header: `vastaus:${k}`,
    }));
}

/** @param {Draft} d @param {string} id @param {string} heading @param {Line[]} ls @param {string} [joiner] */
function add(d, id, heading, ls, joiner = " ") {
  d.sections.push({ id, heading, lines: ls, joiner });
}

/**
 * @param {Draft} d
 * @param {Fact[]} content
 * @param {HeadingSetting[]} headings
 */
function buildRecord(d, content, headings) {
  const enabled = new Set(headings.filter((h) => h.enabled).map((h) => h.id));
  const label = (/** @type {string} */ id) => headings.find((h) => h.id === id)?.label ?? id;
  const now = content.filter((f) => f.header === "Nykytila");
  const hist = content.filter((f) => (f.category === "perustieto" || f.category === "potilaan_kertoma") && !(enabled.has("nykytila") && f.header === "Nykytila"));
  const status = content.filter((f) => f.category === "havainto");
  const results = content.filter((f) => f.category === "tutkimustulos");
  const plan = content.filter((f) => f.category === "suunnitelma");
  for (const h of headings) {
    if (!h.enabled) continue;
    switch (h.id) {
      case "esitiedot":
        add(d, h.id, label(h.id), hist.length ? lines(hist) : [ph("TÄYDENNÄ: esitiedot")]);
        break;
      case "nykytila":
        add(d, h.id, label(h.id), now.length ? lines(now) : [ph("TÄYDENNÄ: nykytila")]);
        break;
      case "status":
        add(d, h.id, label(h.id), status.length ? lines(status) : [ph("Ei statuslöydöksiä syötteessä – kirjaa tai vahvista tutkitut löydökset. Puuttuva tieto ei tarkoita normaalia löydöstä")]);
        if (results.length) add(d, "tutkimukset", "Tutkimustulokset (lähdeasiakirjoista)", lines(results), "\n");
        break;
      case "arvio":
        add(d, h.id, label(h.id), [ph("LÄÄKÄRI KIRJOITTAA: arvio")]);
        break;
      case "suunnitelma":
        add(d, h.id, label(h.id), plan.length ? lines(plan) : [ph("Ei suunnitelmaa syötteessä – TÄYDENNÄ tarvittaessa")]);
        break;
      case "yhteenveto":
        add(d, h.id, label(h.id), [ph("LÄÄKÄRI KIRJOITTAA: yhteenveto (sääntöpohjainen tila ei tee kliinistä yhteenvetoa)")]);
        break;
      default:
        add(d, h.id, h.label, [ph(`TÄYDENNÄ: ${h.label.toLowerCase()}`)]);
    }
  }
  if (!enabled.has("status") && results.length) add(d, "tutkimukset", "Tutkimustulokset (lähdeasiakirjoista)", lines(results), "\n");
}

const TRIAL_RE = /(\d+\s?mg|lääki\p{L}*|lääke\p{L}*|kipulääk\p{L}*|burana|ibuprofeen\p{L}*|parasetamol\p{L}*|panadol|naprokseen\p{L}*|kortisoni\p{L}*|pistos\p{L}*|injekti\p{L}*|fysioterap\p{L}*|kuntoutu\p{L}*|liikeharjoit\p{L}*|tukisido\p{L}*|lepo|kokeil\p{L}*|hoitokokeil\p{L}*|auttaa|auttanut|ei apua)/iu;

/**
 * @param {Draft} d @param {Fact[]} content @param {string} input @param {Record<string,string>} answers
 */
function buildReferral(d, content, input, answers) {
  const target = answers.kohde?.trim() || referralTarget(input);
  const question = answers.kysymys?.trim() ? [] : referralQuestion(d.facts);
  const basis = d.facts.filter((f) => f.category === "komento" && /(?<![\p{L}])(?:syy|peruste|koska|jotta|tarkoitus)(?![\p{L}])/iu.test(f.text) && !f.id.startsWith("a-"));
  const urgent = content.find((f) => /kiire\p{L}*|päivystyks\p{L}*|heti(?![\p{L}])|akuut\p{L}*|pikaisesti/iu.test(f.text)) ?? d.facts.find((f) => /kiire\p{L}*|päivystyks\p{L}*/iu.test(f.text));
  const trials = content.filter((f) => f.category === "potilaan_kertoma" && TRIAL_RE.test(f.text));
  const hist = content.filter((f) => (f.category === "perustieto" || f.category === "potilaan_kertoma") && !trials.includes(f) && !question.includes(f));
  const status = content.filter((f) => f.category === "havainto");
  const results = content.filter((f) => f.category === "tutkimustulos");
  const plan = content.filter((f) => f.category === "suunnitelma");

  add(d, "vastaanottaja", "Vastaanottaja", target ? [{ text: `Lähete ${target.toLowerCase()}.`, factIds: answers.kohde ? ["a-kohde"] : [], origin: "kayttaja" }] : [ph("TÄYDENNÄ: lähetteen kohde")]);
  add(d, "kiireellisyys", "Kiireellisyys", [ph(urgent ? `LÄÄKÄRI VAHVISTAA: syötteessä mainitaan ”${urgent.text}” – kiireellisyys on lääkärin päätös` : "LÄÄKÄRI VAHVISTAA: kiireellisyys")]);
  const qLines = answers.kysymys?.trim()
    ? [{ text: toSentence(answers.kysymys.trim()), factIds: ["a-kysymys"], origin: /** @type {const} */ ("kayttaja") }]
    : question.length ? question.map(line) : [ph("TÄYDENNÄ: kysymyksenasettelu – mitä vastaanottajalta pyydetään")];
  add(d, "kysymys", "Kysymyksenasettelu", qLines);
  const basisLines = answers.peruste?.trim()
    ? [{ text: toSentence(answers.peruste.trim()), factIds: ["a-peruste"], origin: /** @type {const} */ ("kayttaja") }]
    : basis.length ? basis.map(line) : [ph("TÄYDENNÄ: lähettämisen peruste lääkärin ilmoittamana")];
  add(d, "peruste", "Lähettämisen peruste", basisLines);
  add(d, "esitiedot", "Esitiedot", hist.length ? lines(hist) : [ph("TÄYDENNÄ: esitiedot")]);
  add(d, "hoitokokeilut", "Hoitokokeilut", trials.length ? lines(trials) : [ph("TÄYDENNÄ: aiemmat hoitokokeilut ja niiden vaste")]);
  add(d, "status", "Status", status.length ? lines(status) : [ph("Ei statuslöydöksiä syötteessä – puuttuva tieto ei tarkoita normaalia löydöstä")]);
  add(d, "tutkimukset", "Tutkimukset (lähdeasiakirjoista)", results.length ? lines(results) : [ph("TÄYDENNÄ: aiemmat tutkimukset")], "\n");
  if (plan.length) add(d, "suunnitelma", "Nykyinen suunnitelma", lines(plan));

  if (!target) d.issues.push(issue("puuttuu-kohde", "puuttuu", "Lähetteen kohde puuttuu.", false));
  if (!qLines.some((l) => !l.placeholder)) {
    d.issues.push(issue("puuttuu-kysymys", "puuttuu", "Kysymyksenasettelu puuttuu: mitä vastaanottajalta pyydetään? Sitä ei keksitä lähteen ulkopuolelta.", false));
    d.needs.push({ kind: "question", field: "kysymys", question: "Mikä on lähetteen kysymyksenasettelu (mitä vastaanottajalta pyydetään)?" });
  }
  if (!basisLines.some((l) => !l.placeholder)) d.issues.push(issue("puuttuu-peruste", "puuttuu", "Lähettämisen peruste puuttuu lääkärin ilmoittamana.", false));
  if (!results.length) d.issues.push(issue("puuttuu-tutkimukset", "puuttuu", "Aiempia tutkimuksia ei mainita.", false));
  if (!trials.length) d.issues.push(issue("puuttuu-hoitokokeilut", "puuttuu", "Hoitokokeiluja ei mainita.", false));
  if (urgent) d.issues.push(issue("kiire", "huomio", `Syötteessä mainitaan ”${urgent.text}”. Kiireellisyyttä ei päätellä yksittäisestä sanasta – lääkäri vahvistaa.`, false));
}

/**
 * @param {Draft} d @param {Fact[]} content @param {ComposeRequest} req @param {Record<string,string>} answers
 */
function buildStatement(d, content, req, answers) {
  const purpose = req.purposeId ? purposeById(req.purposeId) : detectPurpose(req.input);
  if (!purpose) {
    d.blocked = true;
    d.needs.push({
      kind: "purpose",
      question: "Mihin käyttötarkoitukseen lausunto laaditaan? Lausuntopohja ja tarkistuslista valitaan sen mukaan.",
      options: BC_PURPOSES.map((p) => ({ id: p.id, label: p.label })),
    });
    d.info.push("Kela: BC-lausunnolle valitaan käyttötarkoitus, joka määrittää täytettävät osat. Uusi BC-lausunto korvaa B- ja C-lausunnot.");
    return;
  }
  d.title = `BC-lausunnon luonnos: ${purpose.label}`;
  d.sourceLinks.push({ label: `Kela: BC-lausunto – ${purpose.label} (sivu päivitetty ${fiDate(KELA_PAGE_UPDATED)}, tarkistettu ${fiDate(KELA_CHECKED)})`, url: purpose.url });
  d.info.push(`Laatija: ${purpose.author}`, ...purpose.notes, "Varsinainen lausunto täytetään, allekirjoitetaan ja välitetään potilastietojärjestelmän BC-lausunnolla. Tämä on tekstiluonnos.");
  if (!purpose.verified) d.issues.push(issue("pohja-tarkistamatta", "huomio", "Tämän käyttötarkoituksen Kelan ohjetta ei ole tarkistettu sovellukseen – käytössä on yleisrakenne.", false));
  /** @type {Set<string>} */
  const used = new Set();
  // Tarkin osio voittaa: ensin sisältöön perustuvat (toimintakyky, työkyky, kuntoutustarve), sitten luokkaan perustuvat.
  /** @type {Map<string, import("./bc-purposes.js").BcSection>} */
  const assignment = new Map();
  for (const f of content) {
    const byMatch = purpose.sections.find((s) => !s.doctorOnly && s.match?.test(f.text));
    const byCat = purpose.sections.find((s) => !s.doctorOnly && s.categories.includes(f.category));
    const target = f.category === "tutkimustulos" || f.category === "havainto" ? byCat ?? byMatch : byMatch ?? byCat;
    if (target) assignment.set(f.id, target);
  }
  for (const s of purpose.sections) {
    /** @type {Line[]} */
    let ls = [];
    if (s.heading === "Lausunnon tarkoitus") ls = [{ text: `${purpose.label}.`, factIds: [], origin: "pohja" }];
    else if (s.doctorOnly) ls = [ph(`LÄÄKÄRI KIRJOITTAA: ${s.items[0]?.label ?? s.heading}`)];
    else {
      const picked = content.filter((f) => assignment.get(f.id) === s);
      picked.forEach((f) => used.add(f.id));
      ls = picked.length ? lines(picked) : [];
      for (const it of s.items) {
        if (it.needsDoctor) continue;
        const found = it.detect ? content.some((f) => it.detect?.test(f.text)) : false;
        if (!found) {
          ls.push(ph(`TÄYDENNÄ: ${it.label}`));
          d.issues.push(issue(`bc-${it.id}`, "puuttuu", `${s.heading}: ${it.label} – ei löydy syötteestä.`, false));
        }
      }
      if (ls.length === 0) ls = [ph(`TÄYDENNÄ tarvittaessa: ${s.heading.toLowerCase()}`)];
    }
    add(d, slug(s.heading), s.heading, ls, s.categories.includes("tutkimustulos") ? "\n" : " ");
    if (s.heading === "Lausunnon tarkoitus") {
      const last = d.sections[d.sections.length - 1];
      if (last) last.fixed = true;
    }
  }
  const unused = content.filter((f) => !used.has(f.id));
  if (unused.length) {
    add(d, "muut", "Muut syötteen tiedot (sijoita oikeaan kohtaan tai poista)", lines(unused));
    d.issues.push(issue("bc-muut", "huomio", `${unused.length} syötteen tietoa ei sopinut lausunnon osioihin – ne näkyvät kohdassa ”Muut syötteen tiedot”.`, false));
  }
  void answers;
  d.issues.push(issue("bc-johtopaatos", "huomio", "Työkykyä koskevaa johtopäätöstä ei muodosteta: puuttuvaa toimintakyvyn kuvausta ei muuteta työkykyarvioksi.", false));
}

/** @param {Draft} d @param {Fact[]} content */
function buildPatientExplanation(d, content) {
  const plan = content.filter((f) => f.category === "suunnitelma");
  const rest = content.filter((f) => f.category !== "suunnitelma" && f.category !== "perustieto");
  const interp = rest.filter((f) => f.uncertain || /(sopi\p{L}*|viittaa\p{L}*|tulkin\p{L}*|yhteensopiv\p{L}*|johtu\p{L}*)/iu.test(f.text));
  const findings = rest.filter((f) => !interp.includes(f));
  /** @type {string | undefined} */
  let shown;
  const withLabel = (/** @type {Fact} */ f, /** @type {string} */ t) => {
    const label = visibleLabel(f);
    if (!label || label === shown) return t;
    shown = label;
    return `${label}: ${t}`;
  };
  add(d, "loydos", "Mitä tutkimuksessa todettiin", findings.length ? findings.map((f) => ({ text: withLabel(f, plainFinding(f.text)), factIds: [f.id], origin: f.origin })) : [ph("TÄYDENNÄ: tutkimuksen löydös")], "\n");
  add(d, "tulkinta", "Mitä löydös voi tarkoittaa", interp.length ? interp.map((f) => ({ text: plainInterpretation(f.text), factIds: [f.id], origin: f.origin })) : [ph("LÄÄKÄRI KIRJOITTAA tarvittaessa: löydöksen merkitys – lähteessä ei ole tulkintaa")], "\n");
  add(d, "jatko", "Mitä seuraavaksi tehdään", plan.length ? plan.map((f) => ({ text: plainPlan(f.text), factIds: [f.id], origin: f.origin })) : [ph("TÄYDENNÄ: sovittu jatkotoimi – sitä ei lisätä ilman lähdettä")], "\n");
  d.info.push("Lääketieteelliset termit on avattu sanastosta; alkuperäinen termi on suluissa. Hoito-ohjetta ei lisätä, jos sitä ei ole lähteessä.");
  if (!plan.length) d.issues.push(issue("puuttuu-jatko", "puuttuu", "Sovittua jatkotointa ei ole lähteessä.", false));
}

/** @param {Draft} d @param {Fact[]} content */
function buildResultSummary(d, content) {
  const results = content.filter((f) => f.category === "tutkimustulos");
  const src = results.length ? results : content.filter((f) => f.category !== "suunnitelma");
  const label = src.find((f) => f.headerLabel)?.headerLabel;
  const interp = src.filter((f) => f.uncertain || /(sopi\p{L}*|viittaa\p{L}*|tulkin\p{L}*)/iu.test(f.text));
  const finds = src.filter((f) => !interp.includes(f));
  add(d, "tutkimus", "Tutkimus", label ? [{ text: toSentence(label), factIds: src.filter((f) => f.headerLabel === label).map((f) => f.id), origin: "lahdeasiakirja" }] : [ph("TÄYDENNÄ: tutkimus ja päivämäärä")]);
  add(d, "loydokset", "Löydökset", finds.length ? lines(finds) : [ph("TÄYDENNÄ: löydökset")]);
  if (interp.length) add(d, "tulkinta", "Lausunnon tulkinta (radiologin/laboratorion)", lines(interp));
  if (!results.length) d.issues.push(issue("tiivistelma-luokka", "epävarma", "Syötteestä ei tunnistettu selvää tutkimuslausuntoa; tiivistelmä perustuu koko tekstiin.", false));
}

/** @param {Draft} d @param {string} input */
function buildLanguage(d, input) {
  const body = input
    .split("\n")
    .filter((l, i) => !(i === 0 && /korjaa|kieliasu|oikolue/i.test(l) && /[:.]\s*$/.test(l) && l.length < 80))
    .join("\n")
    .replace(/^.*?(?:korjaa\s+(?:vain\s+)?kieliasu|oikolue)[^:.\n]*[:.]\s*/i, "");
  const fixed = body
    .split("\n")
    .map((l) => (l.trim() ? toSentence(l.replace(/\s{2,}/g, " ").replace(/\s+([,.;:])/g, "$1").replace(/([,;])(?=\S)/g, "$1 ")) : ""))
    .join("\n");
  add(d, "korjattu", "Korjattu teksti", [{ text: fixed, factIds: d.facts.filter((f) => f.category !== "komento").map((f) => f.id), origin: "kayttaja" }], "\n");
  const diff = wordDiff(body, fixed).filter((x) => x.op !== "=");
  d.info.push("Sääntöpohjainen kieliasun korjaus kattaa vain välilyönnit, välimerkit ja isot alkukirjaimet. Laajempi korjaus vaatii kielimallin, jota ei ole määritetty.");
  d.issues.push(issue("kieliasu-muutokset", "huomio", diff.length ? `Muutoksia ${diff.length}: ${diff.slice(0, 12).map((x) => `${x.op}${x.token}`).join(" ")}` : "Ei muutoksia.", false));
}

/**
 * @typedef {{ id: string, heading: string, cats?: import("./extract.js").Category[], answer?: string, missing?: string, optional?: boolean, fromTarget?: boolean, fromQuestion?: boolean }} GenericSpec
 * @param {Draft} d @param {Fact[]} content @param {GenericSpec[]} spec @param {string} [input]
 */
function buildGeneric(d, content, spec, input = "") {
  for (const s of spec) {
    /** @type {Line[]} */
    let ls = [];
    if (s.cats) ls = lines(content.filter((f) => s.cats?.includes(f.category)));
    if (s.fromTarget) {
      const t = referralTarget(input.replace(/konsultaatio\p{L}*/giu, "lähete"));
      if (t) ls = [{ text: toSentence(t), factIds: [], origin: "kayttaja" }];
    }
    if (s.fromQuestion) ls = referralQuestion(d.facts).map(line);
    if (ls.length === 0 && s.optional) continue;
    if (ls.length === 0) ls = [ph(s.missing ?? `TÄYDENNÄ: ${s.heading.toLowerCase()}`)];
    add(d, s.id, s.heading, ls, s.cats?.includes("tutkimustulos") && s.cats.length === 1 ? "\n" : " ");
  }
}

/** @param {Draft} d @returns {Issue[]} */
function missingIssues(d) {
  /** @type {Issue[]} */
  const out = [];
  const status = d.sections.find((s) => s.id === "status");
  if (status && status.lines.every((l) => l.placeholder) && (d.task === "kertomus" || d.task === "lahete")) {
    out.push(issue("puuttuu-status", "puuttuu", "Statuslöydöksiä ei ole syötteessä. Luonnokseen ei lisätty normaalilöydöksiä.", false));
  }
  return out;
}

/** @param {string} id @param {Issue["kind"]} kind @param {string} message @param {boolean} blocking @returns {Issue} */
function issue(id, kind, message, blocking) {
  return { id, kind, message, factIds: [], blocking };
}

/** @param {Section} s */
export function sectionText(s) {
  return s.lines.map((l) => l.text).join(s.joiner);
}

/**
 * Koko luonnos kopioitavana tekstinä: otsikko omalla rivillään, osiot tyhjällä rivillä erotettuina.
 * @param {{ sections: { heading: string, text: string }[] } | Draft} d
 */
export function draftText(d) {
  const secs = "facts" in d ? d.sections.map((s) => ({ heading: s.heading, text: sectionText(s) })) : d.sections;
  return secs.map((s) => `${s.heading}\n${s.text}`).join("\n\n");
}

/**
 * Lähdevertailuun menevä teksti: osioiden sisältö ilman otsikoita ja kiinteitä pohjatekstejä.
 * @param {{ text: string, fixed?: boolean }[]} sections
 */
export function checkText(sections) {
  return sections.filter((s) => !s.fixed).map((s) => s.text).join("\n\n");
}

/** @param {string} s */
function slug(s) {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}

/** @param {string} iso */
function fiDate(iso) {
  const [y, m, dd] = iso.split("-");
  return `${Number(dd)}.${Number(m)}.${y}`;
}

export { isUncertain };
