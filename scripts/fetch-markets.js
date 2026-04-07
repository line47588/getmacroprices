// Node 18+: มี fetch ให้ใช้ในตัว
// ดึง: VIX, U.S. 10Y, Crude Oil, Gold จาก Investing -> เขียนเป็น data/latest.json
// พร้อม dump debug html/text ของแต่ละหน้าไว้ใน data/

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";

const OUT_DIR = "data";
const OUT_FILE = `${OUT_DIR}/latest.json`;
const DEBUG_DIR = "data";

const SOURCES = {
  vix: "https://www.investing.com/indices/us-spx-vix-futures",
  us10y: "https://www.investing.com/rates-bonds/u.s.-10-year-bond-yield",
  crudeOil: "https://www.investing.com/commodities/crude-oil",
  gold: "https://www.investing.com/currencies/xau-usd"
};

function log(...args) {
  console.log("[fetch]", ...args);
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function saveDebugFile(name, content) {
  ensureDir(DEBUG_DIR);
  writeFileSync(`${DEBUG_DIR}/debug-${name}.txt`, content || "");
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      "accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
      "cache-control": "no-cache",
      "pragma": "no-cache"
    }
  });

  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return await res.text();
}

function toNumber(v) {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/,/g, "").trim());
  return Number.isNaN(n) ? null : n;
}

function firstMatchNumber(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1]) {
      const n = toNumber(m[1]);
      if (n != null) return n;
    }
  }
  return null;
}

function htmlToText(html) {
  if (!html) return "";

  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function debugSnippet(name, html) {
  const text = htmlToText(html);

  const htmlHead = html.slice(0, 3000);
  const textHead = text.slice(0, 3000);

  saveDebugFile(`${name}-html`, htmlHead);
  saveDebugFile(`${name}-text`, textHead);

  log(`${name} html[0..500]:`, html.slice(0, 500));
  log(`${name} text[0..700]:`, text.slice(0, 700));

  return text;
}

function parseGold(text) {
  const price = firstMatchNumber(text, [
    /The current XAU\/USD exchange rate is\s*([0-9,]+\.\d+)/i,
    /current XAU\/USD exchange rate is\s*([0-9,]+\.\d+)/i,
    /XAU\/USD[^0-9]{1,60}([0-9,]+\.\d{2})/i
  ]);

  const prevClose = firstMatchNumber(text, [
    /with a previous close of\s*([0-9,]+\.\d+)/i,
    /Prev\.?\s*Close[^0-9]{0,20}([0-9,]+\.\d+)/i,
    /previous close[^0-9]{0,20}([0-9,]+\.\d+)/i
  ]);

  return { price, prevClose };
}

function parseCrudeOil(text) {
  const price = firstMatchNumber(text, [
    /The current price of Crude Oil WTI futures is\s*([0-9,]+\.\d+)/i,
    /The current price of Crude Oil WTI is\s*([0-9,]+\.\d+)/i,
    /Crude Oil WTI Futures[^0-9]{1,60}([0-9,]+\.\d{2})/i
  ]);

  const prevClose = firstMatchNumber(text, [
    /with a previous close of\s*([0-9,]+\.\d+)/i,
    /Prev\.?\s*Close[^0-9]{0,20}([0-9,]+\.\d+)/i,
    /previous close[^0-9]{0,20}([0-9,]+\.\d+)/i
  ]);

  return { price, prevClose };
}

function parseVix(text) {
  const price = firstMatchNumber(text, [
    /The current S&P 500 VIX Futures price is\s*([0-9,]+\.\d+)/i,
    /current S&P 500 VIX Futures price is\s*([0-9,]+\.\d+)/i,
    /S&P 500 VIX Futures[^0-9]{1,60}([0-9,]+\.\d{2})/i
  ]);

  const prevClose = firstMatchNumber(text, [
    /with a previous close of\s*([0-9,]+\.\d+)/i,
    /Prev\.?\s*Close[^0-9]{0,20}([0-9,]+\.\d+)/i,
    /previous close[^0-9]{0,20}([0-9,]+\.\d+)/i
  ]);

  return { price, prevClose };
}

function parseUs10Y(text) {
  const price = firstMatchNumber(text, [
    /United States 10-Year Bond Yield[^0-9]{1,80}([0-9,]+\.\d{3})/i,
    /U\.?S\.? 10 Year Treasury Yield[^0-9]{1,80}([0-9,]+\.\d{3})/i,
    /Price[^0-9]{0,20}([0-9,]+\.\d{3})/i
  ]);

  const prevClose = firstMatchNumber(text, [
    /Prev\.?\s*Close[^0-9]{0,20}([0-9,]+\.\d{3})/i,
    /previous close[^0-9]{0,20}([0-9,]+\.\d{3})/i
  ]);

  return { price, prevClose };
}

function calcPct(price, prevClose) {
  if (price == null || prevClose == null || prevClose === 0) return null;
  return Number((((price - prevClose) / prevClose) * 100).toFixed(4));
}

function mergeFallback(next, prev) {
  for (const key of ["vix", "us10y", "crudeOil", "gold"]) {
    if (!next[key]) next[key] = { price: null, prevClose: null, pct: null };
    if (next[key].price == null) next[key].price = prev?.[key]?.price ?? null;
    if (next[key].prevClose == null) next[key].prevClose = prev?.[key]?.prevClose ?? null;
    if (next[key].pct == null) next[key].pct = prev?.[key]?.pct ?? null;
  }
}

async function main() {
  const result = {
    ts: new Date().toISOString(),
    source: "investing",
    vix: { price: null, prevClose: null, pct: null },
    us10y: { price: null, prevClose: null, pct: null },
    crudeOil: { price: null, prevClose: null, pct: null },
    gold: { price: null, prevClose: null, pct: null }
  };

  ensureDir(OUT_DIR);

  for (const [key, url] of Object.entries(SOURCES)) {
    try {
      log(`Fetching ${key}: ${url}`);
      const html = await fetchHtml(url);
      const text = debugSnippet(key, html);

      if (/Just a moment|Access denied|captcha|verify you are human|blocked/i.test(text)) {
        throw new Error(`Blocked page detected for ${key}`);
      }

      if (key === "gold") result.gold = parseGold(text);
      if (key === "crudeOil") result.crudeOil = parseCrudeOil(text);
      if (key === "vix") result.vix = parseVix(text);
      if (key === "us10y") result.us10y = parseUs10Y(text);

      log(`${key} parsed =>`, result[key]);
    } catch (e) {
      log(`WARN ${key}:`, String(e));
      saveDebugFile(`${key}-error`, String(e));
    }
  }

  result.vix.pct = calcPct(result.vix.price, result.vix.prevClose);
  result.us10y.pct = calcPct(result.us10y.price, result.us10y.prevClose);
  result.crudeOil.pct = calcPct(result.crudeOil.price, result.crudeOil.prevClose);
  result.gold.pct = calcPct(result.gold.price, result.gold.prevClose);

  let prev = null;
  if (existsSync(OUT_FILE)) {
    try {
      prev = JSON.parse(readFileSync(OUT_FILE, "utf-8"));
    } catch {}
  }

  mergeFallback(result, prev);

  writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
  log("Wrote", OUT_FILE);
  log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
