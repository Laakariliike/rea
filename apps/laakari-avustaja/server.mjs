#!/usr/bin/env node
// Paikallinen staattinen palvelin. Ei vastaanota potilastekstiä: sovellus
// käsittelee kaiken selaimessa, eikä palvelimella ole POST-rajapintoja.
// Pyyntöjä ei lokiteta. Oletuksena vain tämä kone (127.0.0.1); --lan avaa
// lähiverkkoon iPad-käyttöä varten.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("./public/", import.meta.url)));
const args = process.argv.slice(2);
const lan = args.includes("--lan");
const portArg = args.find((a) => a.startsWith("--port="));
const port = portArg ? Number(portArg.split("=")[1]) : Number(process.env.PORT ?? 8787);
const host = lan ? "0.0.0.0" : "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

const HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": "same-origin",
};

const server = createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD", ...HEADERS }).end();
    return;
  }
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = normalize(join(ROOT, rel));
    if (!file.startsWith(ROOT + sep)) {
      res.writeHead(403, HEADERS).end();
      return;
    }
    const st = await stat(file);
    if (!st.isFile()) throw new Error("not a file");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[/** @type {keyof typeof TYPES} */ (extname(file))] ?? "application/octet-stream", ...HEADERS });
    res.end(req.method === "HEAD" ? undefined : body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", ...HEADERS }).end("Ei löydy");
  }
});

server.listen(port, host, () => {
  console.log(`Lääkärin kirjoitusavustaja (prototyyppi): http://localhost:${port}/`);
  if (lan) {
    for (const list of Object.values(networkInterfaces())) {
      for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) console.log(`  iPad / lähiverkko: http://${a.address}:${port}/`);
    }
    console.log("  Huom: lähiverkkoyhteys on salaamaton (http). Käytä vain synteettistä aineistoa.");
  }
  console.log("Pysäytä: Ctrl+C. Palvelin ei lokita pyyntöjä eikä vastaanota tekstiä.");
});
