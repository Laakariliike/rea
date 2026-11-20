import { test } from "node:test";
import assert from "node:assert/strict";
import { detectIntent } from "../public/core/intent.js";
import { extractFacts, findingPolarity } from "../public/core/extract.js";
import { compose, draftText, sectionText, checkText } from "../public/core/compose.js";
import { fidelityIssues } from "../public/core/checks.js";
import { segment, numericValues, wordDiff } from "../public/core/text.js";
import { applyStatusPhrase, EXAMPLE_PHRASES, importPhrases, exportPhrases, searchPhrases, upsertPhrase, deletePhrase } from "../public/core/phrases.js";
import { CASES } from "./fixtures.mjs";

const sec = (/** @type {any} */ d, /** @type {string} */ id) => d.sections.find((/** @type {any} */ s) => s.id === id);

test("segment säilyttää lähdekohdat ja desimaalit", () => {
  const t = "CRP 3,5 mg/l, Hb 135. Kontrolli 3.4.2026";
  for (const s of segment(t)) assert.equal(t.slice(s.start, s.end).replace(/\.$/, ""), s.text);
  assert.deepEqual(segment(t).map((s) => s.text), ["CRP 3,5 mg/l", "Hb 135", "Kontrolli 3.4.2026"]);
});

test("tehtävän tunnistus: esimerkkisyötteet", () => {
  assert.equal(detectIntent(CASES.olkapaa).candidates[0]?.task, "kertomus");
  assert.equal(detectIntent(CASES.lahete).candidates[0]?.task, "lahete");
  assert.equal(detectIntent(CASES.bcPsykoterapia).candidates[0]?.task, "bc");
  assert.equal(detectIntent(CASES.radiologi).candidates[0]?.task, "potilasselitys");
  assert.equal(detectIntent("Korjaa vain kieliasu: pot kertoo kipua").candidates[0]?.task, "kieliasu");
  const vague = detectIntent("olkapää kipeä");
  assert.equal(vague.status, "epäselvä");
  assert.ok(vague.candidates.length >= 1 && vague.candidates.length <= 3);
});

test("A: olkapäämerkintä ilman keksittyä statuslöydöstä", () => {
  const d = compose({ task: "kertomus", input: CASES.olkapaa });
  const status = sectionText(sec(d, "status"));
  assert.match(status, /^\[Ei statuslöydöksiä/);
  assert.ok(sec(d, "status").lines.every((/** @type {any} */ l) => l.placeholder));
  const esi = sectionText(sec(d, "esitiedot"));
  assert.match(esi, /45-vuotias/);
  assert.match(esi, /oik\. olkapää 3 viikkoa/);
  assert.match(esi, /ei traumaa/);
  assert.doesNotMatch(draftText(d), /Tee merkintä/);
  assert.ok(d.issues.some((i) => i.id === "puuttuu-status"));
  assert.ok(!d.issues.some((i) => i.kind === "ero"), JSON.stringify(d.issues));
});

test("B: lähete anamneesista ja tutkimuksesta; kysymyksenasettelu nostetaan esiin", () => {
  const d = compose({ task: "lahete", input: CASES.lahete });
  assert.match(sectionText(sec(d, "vastaanottaja")), /ortopedille/i);
  assert.match(sectionText(sec(d, "kysymys")), /^\[TÄYDENNÄ: kysymyksenasettelu/);
  assert.ok(d.needs.some((n) => n.field === "kysymys"));
  assert.match(sectionText(sec(d, "tutkimukset")), /meniskin takasarven repeämä/);
  assert.match(sectionText(sec(d, "hoitokokeilut")), /Ibuprofeeni 400 mg 1x3/);
  assert.match(sectionText(sec(d, "status")), /Lachman neg/);
  assert.match(sectionText(sec(d, "kiireellisyys")), /LÄÄKÄRI VAHVISTAA/);
  // Kuvantamislöydös ei siirry statukseen.
  assert.doesNotMatch(sectionText(sec(d, "status")), /menisk/);
  const answered = compose({ task: "lahete", input: CASES.lahete, answers: { kysymys: "Artroskopian tarpeen arvio" } });
  assert.equal(sectionText(sec(answered, "kysymys")), "Artroskopian tarpeen arvio.");
  assert.ok(!answered.needs.some((n) => n.field === "kysymys"));
});

test("C: B-lausunto kysyy käyttötarkoituksen ennen pohjaa", () => {
  const d = compose({ task: "bc", input: CASES.bcEiTarkoitusta });
  assert.equal(d.blocked, true);
  assert.equal(d.sections.length, 0);
  assert.equal(d.needs[0]?.kind, "purpose");
  const p = compose({ task: "bc", input: CASES.bcEiTarkoitusta, purposeId: "kuntoutuspsykoterapia" });
  assert.equal(p.blocked, false);
  assert.ok(p.sourceLinks[0]?.url.startsWith("https://www.kela.fi/"));
  const all = draftText(p);
  assert.match(all, /Päihdeanamneesi – |TÄYDENNÄ: Päihdeanamneesi/);
  assert.match(sectionText(sec(p, "työkykyä-koskevat-johtopäätökset")), /LÄÄKÄRI KIRJOITTAA/);
});

test("C2: kuntoutuspsykoterapian lausunto käyttää lähdetietoja eikä tee työkykyarviota", () => {
  const d = compose({ task: "bc", input: CASES.bcPsykoterapia });
  assert.match(d.title, /Kuntoutuspsykoterapia/);
  assert.match(sectionText(sec(d, "toimintakyky")), /Keskittyminen heikentynyt/);
  assert.match(sectionText(sec(d, "työkykyä-koskevat-johtopäätökset")), /^\[LÄÄKÄRI KIRJOITTAA/);
  assert.ok(!d.issues.some((i) => i.id === "bc-paihde"), "päihdeanamneesi löytyy");
  assert.ok(!d.issues.some((i) => i.kind === "ero" && i.blocking), JSON.stringify(d.issues.filter((i) => i.kind === "ero")));
});

test("D: puolisuus- ja normaali/poikkeava-ristiriidat pysäyttävät hyväksynnän", () => {
  const a = compose({ task: "kertomus", input: CASES.puoliRistiriita });
  assert.ok(a.issues.some((i) => i.kind === "ristiriita" && i.blocking && /Puolisuus/.test(i.message)), JSON.stringify(a.issues));
  const b = compose({ task: "kertomus", input: CASES.normaaliPoikkeava });
  const msgs = b.issues.filter((i) => i.kind === "ristiriita").map((i) => i.message).join("\n");
  assert.match(msgs, /turvotus/);
  assert.match(msgs, /liikelaajuus/);
});

test("E: potilasselitys erottaa löydöksen tulkinnasta", () => {
  const d = compose({ task: "potilasselitys", input: CASES.radiologi });
  const loydos = sectionText(sec(d, "loydos"));
  const tulkinta = sectionText(sec(d, "tulkinta"));
  assert.match(loydos, /^Oikean olkapään UÄ: Supraspinatusjänteessä tendinoosia\. \(supraspinatusjänne = ylemmän/);
  assert.match(loydos, /tendinoosi = jänteen rappeuma- tai rasitusmuutos/);
  assert.match(loydos, /Ei täyspaksuista repeämää\. \(täyspaksuinen = koko jänteen läpi ulottuva\)/);
  assert.doesNotMatch(loydos, /impingement/i);
  assert.match(tulkinta, /impingement/i);
  assert.match(tulkinta, /mahdollinen selitys, ei varma tieto/);
  assert.match(sectionText(sec(d, "jatko")), /kontrolli 6 viikkoa/i);
});

test("usean potilaan syöte pysäyttää yhdistelyn", () => {
  const d = compose({ task: "kertomus", input: CASES.kaksiPotilasta });
  assert.equal(d.blocked, true);
  assert.equal(d.sections.length, 0);
  assert.equal(d.issues[0]?.kind, "pysäytys");
});

test("epävarmuus säilyy ja muokkauksen katoava epävarmuus havaitaan", () => {
  const d = compose({ task: "kertomus", input: CASES.epavarma });
  assert.match(draftText(d), /epäillään scaphoideumin murtumaa/);
  const edited = draftText(d).replace("epäillään scaphoideumin murtumaa", "todettu scaphoideumin murtuma");
  const issues = fidelityIssues(edited, d.facts);
  assert.ok(issues.some((i) => /Epävarmuus saattoi kadota/.test(i.message)));
  assert.ok(issues.some((i) => i.id === "varmuus"));
});

test("lähdevertailu: muuttunut luku, puoli ja kielto", () => {
  const d = compose({ task: "kertomus", input: CASES.olkapaa });
  const body = checkText(d.sections.map((s) => ({ text: sectionText(s) })));
  const changed = body.replace("3 viikkoa", "5 viikkoa").replace("oik.", "vas.").replace("ei traumaa", "traumaa");
  const ids = fidelityIssues(changed, d.facts).map((i) => i.id);
  assert.ok(ids.includes("luku-uusi"));
  assert.ok(ids.includes("puoli-uusi-vasen"));
  assert.ok(ids.some((x) => x.startsWith("kielto-")));
  assert.deepEqual(numericValues("Burana 400mg"), numericValues("Burana 400 mg"));
});

test("statusfraasi: valinta ei vahvista, poikkeava korvaa normaalin, puoli tarkistetaan", () => {
  const phrase = { ...EXAMPLE_PHRASES[0], verified: true };
  const src = extractFacts("oik olkapää kipeä. Status: oik abduktio rajoittunut 90 asteeseen.");
  const none = applyStatusPhrase(phrase, [], "oikea", src);
  assert.equal(none.facts.length, 0);
  const r = applyStatusPhrase(phrase, ["i2", "i4"], "oikea", src);
  assert.deepEqual(r.facts.map((f) => f.text), ["Oikea olkapää: Jobe negatiivinen"]);
  assert.ok(r.notes.some((n) => n.kind === "korvattu" && /Abduktio täysi/.test(n.message)));
  const wrongSide = applyStatusPhrase(phrase, ["i4"], "vasen", src);
  assert.equal(wrongSide.facts.length, 0);
  assert.equal(wrongSide.notes[0]?.kind, "puoli");
  const d = compose({ task: "kertomus", input: "oik olkapää kipeä. Status: oik abduktio rajoittunut 90 asteeseen. Tee merkintä.", phraseFacts: r.facts });
  const status = sectionText(sec(d, "status"));
  assert.match(status, /abduktio rajoittunut 90 asteeseen/);
  assert.match(status, /Jobe negatiivinen/);
  assert.doesNotMatch(status, /Abduktio täysi/);
});

test("fraasikirjasto: lisäys, haku, poisto, vienti ja tuonti", () => {
  let list = upsertPhrase([], { id: "x1", title: "Testi", purpose: "suunnitelma", region: "yleinen", text: "Kontrolli tarvittaessa.", findings: [], verified: true, updated: "2026-11-20" });
  assert.equal(searchPhrases(list, { query: "kontrolli" }).length, 1);
  const json = exportPhrases(list);
  const imp = importPhrases([], json, { keepVerification: false });
  assert.equal(imp.added, 1);
  assert.equal(imp.list[0]?.verified, false);
  assert.equal(importPhrases([], json, { keepVerification: true }).list[0]?.verified, true);
  assert.equal(importPhrases([], "{bad", { keepVerification: true }).errors.length, 1);
  list = deletePhrase(list, "x1");
  assert.equal(list.length, 0);
});

test("löydöksen suunta", () => {
  assert.equal(findingPolarity("ei turvotusta"), "normaali");
  assert.equal(findingPolarity("turvoksissa"), "poikkeava");
  assert.equal(findingPolarity("liikelaajuudet täydet"), "normaali");
  assert.equal(findingPolarity("fleksio rajoittunut"), "poikkeava");
  assert.equal(findingPolarity("Lachman neg"), "normaali");
});

test("kieliasu: vain muoto muuttuu", () => {
  const d = compose({ task: "kieliasu", input: "Korjaa vain kieliasu: pot kertoo  kipua oik olkapäässä ,ei traumaa" });
  const t = sectionText(d.sections[0]);
  assert.equal(t, "Pot kertoo kipua oik olkapäässä, ei traumaa.");
  assert.ok(wordDiff("a  b", "a b").every((x) => x.op === "="));
});
