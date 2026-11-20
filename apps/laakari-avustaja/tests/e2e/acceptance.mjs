// Selainpohjaiset hyväksymistestit A–F (Playwright, Chromium).
// Käyttö: node tests/e2e/acceptance.mjs [--shots=hakemisto]
// Käynnistää oman palvelimen satunnaisportissa ja sammuttaa sen lopuksi.

import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { CASES } from "../fixtures.mjs";

const require = createRequire(import.meta.url);
/** @type {typeof import("playwright")} */
const { chromium, devices } = require("playwright");

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const shotsArg = process.argv.find((a) => a.startsWith("--shots="));
const SHOTS = shotsArg ? resolve(shotsArg.slice(8)) : "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const PORT = 8800 + Math.floor(Math.random() * 150);
const BASE = `http://127.0.0.1:${PORT}/`;

/** @type {{ name: string, ok: boolean, detail: string }[]} */
const results = [];
/** @param {string} name @param {boolean} ok @param {string} [detail] */
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` – ${detail}` : ""}`);
}

const server = spawn(process.execPath, ["server.mjs", `--port=${PORT}`], { cwd: APP, stdio: ["ignore", "pipe", "pipe"] });
let serverLog = "";
server.stdout.on("data", (d) => { serverLog += d; });
server.stderr.on("data", (d) => { serverLog += d; });
await new Promise((r) => setTimeout(r, 600));

const browser = await chromium.launch();
/** @type {string[]} */
const consoleLines = [];
/** @type {string[]} */
const requests = [];

/** @param {import("playwright").BrowserContextOptions} opts */
async function openPage(opts) {
  const ctx = await browser.newContext({ ...opts, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  page.on("console", (m) => consoleLines.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => consoleLines.push(`pageerror: ${e.message}`));
  page.on("request", (r) => requests.push(`${r.method()} ${r.url()} ${r.postData() ?? ""}`));
  await page.goto(BASE);
  return { ctx, page };
}

/** @param {import("playwright").Page} page @param {string} text */
async function fill(page, text) {
  await page.click("#clear");
  await page.fill("#input", text);
  await page.waitForTimeout(250);
}
/** @param {import("playwright").Page} page @param {string} id */
const sectionValue = (page, id) => page.inputValue(`textarea[data-section="${id}"]`);
/** @param {import("playwright").Page} page */
const checksText = (page) => page.innerText("#checks");
/** @param {import("playwright").Page} page @param {string} name */
async function shot(page, name) {
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
}

try {
  const { ctx, page } = await openPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });

  // --- A: olkapää ---
  await fill(page, CASES.olkapaa);
  const hintA = await page.innerText("#task-hint");
  await page.keyboard.press("Control+Enter");
  const statusA = await sectionValue(page, "status");
  const esiA = await sectionValue(page, "esitiedot");
  record("A0 lausunnon käyttötarkoitusvalinta piilossa muissa tehtävissä", !(await page.isVisible("#purpose-row")));
  record("A1 tehtävä ehdotetaan ennen luonnosta", /Ehdotettu tehtävä: Potilaskertomusmerkintä/.test(hintA), hintA.slice(0, 80));
  record("A2 status ei sisällä keksittyä löydöstä", /^\[Ei statuslöydöksiä/.test(statusA) && !/normaali|siisti|täysi/i.test(statusA.replace(/\[[^\]]*\]/g, "")), statusA);
  record("A3 esitiedot säilyttävät puolen, keston ja kiellon", /45-vuotias/.test(esiA) && /oik\. olkapää 3 viikkoa/.test(esiA) && /ei traumaa/.test(esiA), esiA);
  record("A4 hyväksyntä estetty, kun täydennettävää on jäljellä", await page.isDisabled("#approve"));
  // Lääkäri täydentää: poistaa täydennyskohdat ja kirjoittaa omat tekstit.
  await page.fill('textarea[data-section="status"]', "Ei tutkittu tällä käynnillä.");
  await page.fill('textarea[data-section="suunnitelma"]', "Kotihoito-ohjeet.");
  await page.fill('textarea[data-section="yhteenveto"]', "Olkapääkipu, seuranta.");
  await page.waitForTimeout(100);
  const approveEnabled = !(await page.isDisabled("#approve"));
  await page.check("#approve");
  await page.click("#copy-all");
  await page.waitForTimeout(150);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  record("A5 hyväksynnän jälkeen kopiointi säilyttää kappalejaot", approveEnabled && /Esitiedot\n45-vuotias[^\n]*\n\nStatus\nEi tutkittu/.test(clip), JSON.stringify(clip.slice(0, 90)));
  await page.click('.section[data-section="esitiedot"] .copy-section');
  await page.waitForTimeout(100);
  const clipSec = await page.evaluate(() => navigator.clipboard.readText());
  record("A6 yksittäisen osion kopiointi", clipSec.startsWith("Esitiedot\n45-vuotias"), JSON.stringify(clipSec.slice(0, 50)));
  await page.keyboard.press("Control+Alt+z");
  const afterUndo = await sectionValue(page, "yhteenveto");
  record("A7 edellisen version palautus", afterUndo !== "Olkapääkipu, seuranta.", afterUndo.slice(0, 60));
  await page.fill('textarea[data-section="esitiedot"]', esiA.replace("3 viikkoa", "5 viikkoa"));
  await page.waitForTimeout(100);
  record("A8 muokkauksessa muuttunut luku havaitaan heti", /Luonnoksessa on lukuja, joita lähteessä ei ole: 5/.test(await checksText(page)));
  await shot(page, "A-olkapaa-1920x1080");

  // Lähdekohdan näyttö
  await page.click('.section[data-section="esitiedot"] button:has-text("Lähteet")');
  await page.click('.section[data-section="esitiedot"] .prov button:has-text("Näytä syötteessä")');
  const sel = await page.evaluate(() => { const t = /** @type {HTMLTextAreaElement} */ (document.getElementById("input")); return t.value.slice(t.selectionStart, t.selectionEnd); });
  record("A9 valmis lause jäljitettävissä syötteeseen", sel === "45 v", JSON.stringify(sel));

  // --- B: lähete ---
  await fill(page, CASES.lahete);
  await page.click("#generate");
  const kysB = await sectionValue(page, "kysymys");
  const tutB = await sectionValue(page, "tutkimukset");
  const statB = await sectionValue(page, "status");
  const needB = await page.innerText("#needs");
  record("B1 lähete muodostuu anamneesista ja tutkimuksesta", /meniskin takasarven repeämä/.test(tutB) && /Lachman neg/.test(statB) && !/menisk/.test(statB));
  record("B2 puuttuva kysymyksenasettelu nostetaan esiin ja kysytään", /^\[TÄYDENNÄ: kysymyksenasettelu/.test(kysB) && /kysymyksenasettelu/i.test(needB) && /Kysymyksenasettelu puuttuu/.test(await checksText(page)));
  await page.fill("#answer-kysymys", "Artroskopian tarpeen arvio");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  record("B3 vastaus täydentää kysymyksenasettelun", (await sectionValue(page, "kysymys")) === "Artroskopian tarpeen arvio.");
  record("B4 kiireellisyys jää lääkärin vahvistettavaksi", /LÄÄKÄRI VAHVISTAA/.test(await sectionValue(page, "kiireellisyys")));
  await shot(page, "B-lahete-1920x1080");

  // --- C: B-lausunto ---
  await fill(page, CASES.bcEiTarkoitusta);
  await page.click("#generate");
  const draftC = await page.innerText("#draft");
  const needC = await page.innerText("#needs");
  record("C1 B-lausunto kysyy käyttötarkoituksen ennen pohjaa", /käyttötarkoitukseen/.test(needC) && (await page.locator("#draft textarea").count()) === 0, draftC.slice(0, 60));
  await page.click('#needs button:has-text("Kuntoutuspsykoterapia")');
  await page.waitForTimeout(100);
  const srcC = await page.innerText("#sources");
  record("C2 valinnan jälkeen pohja + Kelan lähde ja tarkistuspäivä", (await page.locator("#draft textarea").count()) > 5 && /kela\.fi|Kela: BC-lausunto/.test(srcC) && /tarkistettu 20\.11\.2026/.test(srcC), srcC.slice(0, 120));
  record("C3 työkykyjohtopäätös jää lääkärille", /^\[LÄÄKÄRI KIRJOITTAA/.test(await sectionValue(page, "työkykyä-koskevat-johtopäätökset")));
  await shot(page, "C-bc-lausunto-1920x1080");

  // --- D: ristiriidat ---
  await fill(page, CASES.puoliRistiriita);
  await page.click("#generate");
  const chD1 = await checksText(page);
  record("D1 oikea/vasen-ristiriita näytetään", /Puolisuus ristiriidassa/.test(chD1));
  await fill(page, CASES.normaaliPoikkeava);
  await page.click("#generate");
  const chD2 = await checksText(page);
  record("D2 normaali/poikkeava-ristiriita näytetään", /Normaali ja poikkeava löydös samasta kohteesta \(turvotus\)/.test(chD2) && /\(liikelaajuus\)/.test(chD2));
  // Poista täydennyskohdat: ristiriita estää yhä hyväksynnän, kunnes se on kuitattu.
  for (const id of ["suunnitelma", "yhteenveto"]) await page.fill(`textarea[data-section="${id}"]`, "Lääkärin teksti.");
  await page.waitForTimeout(100);
  const blockedByConflict = await page.isDisabled("#approve");
  for (const cb of await page.locator("#checks input[data-ack]").all()) await cb.check();
  const enabledAfterAck = !(await page.isDisabled("#approve"));
  record("D3 ristiriita estää hyväksynnän kunnes lääkäri kuittaa", blockedByConflict && enabledAfterAck);
  await shot(page, "D-ristiriita-1920x1080");

  // Statusfraasi: valinta ei vahvista, poikkeava korvaa normaalin
  await fill(page, "oik olkapää kipeä. Status: oik abduktio rajoittunut 90 asteeseen. Tee merkintä.");
  await page.click("#generate");
  await page.keyboard.press("Alt+f");
  await page.click('#phrase-list button:has-text("Olkapään perusstatus")');
  await page.check('#pd-verified');
  await page.click("#pd-save");
  await page.click('#phrase-list button:has-text("Olkapään perusstatus")');
  await page.click("#pd-apply");
  const noneChecked = await page.isVisible("#phrases-dialog");
  await page.check('input[data-finding="i2"]');
  await page.check('input[data-finding="i4"]');
  await page.click("#pd-apply");
  await page.waitForTimeout(100);
  const statusF = await sectionValue(page, "status");
  record("D4 statusfraasi: tyhjä valinta ei lisää mitään", noneChecked);
  record("D5 statusfraasi: vahvistettu löydös lisätään, ristiriitainen normaali jätetään pois", /abduktio rajoittunut 90 asteeseen/.test(statusF) && /Jobe negatiivinen/.test(statusF) && !/Abduktio täysi/.test(statusF) && /jätettiin pois/.test(await checksText(page)), statusF);

  // --- E: potilaalle ---
  await fill(page, CASES.radiologi);
  await page.click("#generate");
  const lE = await sectionValue(page, "loydos");
  const tE = await sectionValue(page, "tulkinta");
  record("E1 potilasselitys erottaa löydöksen ja tulkinnan", /tendinoosia/.test(lE) && !/impingement/i.test(lE) && /impingement/i.test(tE) && /mahdollinen selitys, ei varma tieto/.test(tE));
  record("E2 jatkotoimi vain lähteestä", /Fysioterapiaohjaus/.test(await sectionValue(page, "jatko")));
  await shot(page, "E-potilaalle-1920x1080");

  // Usean potilaan pysäytys
  await fill(page, CASES.kaksiPotilasta);
  await page.click("#generate");
  record("X1 usean potilaan aineisto pysäyttää yhdistelyn", /Yhdistely pysäytetty/.test(await page.innerText("#needs")) && (await page.locator("#draft textarea").count()) === 0);

  // Epäselvä tarkoitus: 2–3 vaihtoehtoa
  await fill(page, "olkapää kipeä");
  const hintX = await page.innerText("#task-hint");
  record("X2 epäselvä tarkoitus ehdottaa 2–3 tehtävää", /Todennäköisimmät/.test(hintX), hintX);
  await page.keyboard.press("Alt+2");
  record("X3 tehtävän vaihto yhdellä painalluksella (Alt+2)", /Valittu tehtävä: Läheteluonnos/.test(await page.innerText("#task-hint")));
  await ctx.close();

  // --- iPad-koko (Chromium-emulaatio: näyttökoko, kosketus, UA – ei oikea Safari) ---
  for (const [name, dev] of /** @type {const} */ ([["iPad-pysty", devices["iPad Pro 11"]], ["iPad-vaaka", devices["iPad Pro 11 landscape"]]])) {
    const { ctx: c2, page: p2 } = await openPage({ ...dev });
    await p2.fill("#input", CASES.olkapaa);
    await p2.waitForTimeout(250);
    await p2.tap("#generate");
    const hasDraft = (await p2.locator("#draft textarea").count()) > 0;
    const noHScroll = await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    const tapTargets = await p2.evaluate(() => [...document.querySelectorAll("button.chip, #generate")].every((b) => b.getBoundingClientRect().height >= 43));
    record(`I ${name}: luonnos muodostuu kosketuksella, ei vaakavieritystä, kosketuskohteet ≥ 44 px`, hasDraft && noHScroll && tapTargets, `${dev.viewport.width}x${dev.viewport.height}`);
    await shot(p2, `I-${name}`);
    await c2.close();
  }

  // --- F: tietosuoja ---
  const canary = `KANARIA-${randomBytes(6).toString("hex")}`;
  const { ctx: ctxF, page: pageF } = await openPage({ viewport: { width: 1920, height: 1080 } });
  requests.length = 0;
  await fill(pageF, `45 v ${canary}, oik olkapää 3 vk. Tee merkintä.`);
  await pageF.click("#generate");
  await pageF.keyboard.press("Alt+f");
  await pageF.keyboard.press("Escape");
  await pageF.waitForTimeout(200);
  const storage = await pageF.evaluate(async () => {
    const dump = { local: JSON.stringify({ ...localStorage }), session: JSON.stringify({ ...sessionStorage }), idb: "" };
    try { dump.idb = JSON.stringify(await indexedDB.databases()); } catch { dump.idb = "n/a"; }
    return dump;
  });
  const cookies = JSON.stringify(await ctxF.cookies());
  const storageClean = ![storage.local, storage.session, storage.idb, cookies].some((s) => s.includes(canary));
  const netClean = requests.every((r) => !r.includes(canary)) && requests.every((r) => r.startsWith(`GET ${BASE}`));
  await ctxF.close();
  await browser.close();
  server.kill();
  await new Promise((r) => setTimeout(r, 200));
  const logClean = !serverLog.includes(canary) && !consoleLines.some((l) => l.includes(canary));
  const repoRoot = resolve(APP, "../..");
  const gitHits = (() => {
    try { return execFileSync("git", ["grep", "-l", canary], { cwd: repoRoot, encoding: "utf8" }).trim(); } catch { return ""; }
  })();
  const untracked = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: repoRoot, encoding: "utf8" });
  const fsHits = untracked.split("\n").map((l) => l.slice(3)).filter(Boolean).filter((p) => {
    try { const f = join(repoRoot, p); return statSync(f).isFile() && statSync(f).size < 5_000_000 && readFileSync(f, "utf8").includes(canary); } catch { return false; }
  });
  const synapsiPaths = ["/mnt/c/Synapsi", "C:\\Synapsi"].filter((p) => { try { return readdirSync(p).length >= 0; } catch { return false; } });
  record("F1 testipotilaan teksti ei päädy selaimen tallennukseen tai evästeisiin", storageClean);
  record("F2 ei verkkopyyntöjä tekstin kanssa; vain saman palvelimen staattiset GET-haut", netClean, `${requests.length} pyyntöä`);
  record("F3 ei palvelinlokiin eikä selainkonsoliin", logClean);
  record("F4 ei Git-tiedostoihin (seuratut + seuraamattomat)", gitHits === "" && fsHits.length === 0);
  record("F5 Synapsin yleistä muistia ei käytetä (polkua ei ole tässä ympäristössä, sovelluksessa ei Synapsi-kytkentää)", synapsiPaths.length === 0);
  record("F6 ei selainvirheitä", !consoleLines.some((l) => /^(error|pageerror)/.test(l)), consoleLines.filter((l) => /^(error|pageerror)/.test(l)).join(" | "));
} catch (e) {
  record("suoritus", false, e instanceof Error ? e.stack ?? e.message : String(e));
  try { await browser.close(); } catch { /* */ }
  server.kill();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} hyväksymistarkistusta läpi.`);
process.exit(failed.length ? 1 : 0);
