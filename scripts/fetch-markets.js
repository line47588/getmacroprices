// Node 18+: มี fetch ให้ใช้ในตัว
// ดึง: VIX, U.S. 10Y, Crude Oil, Gold จาก Investing -> เขียนเป็น data/latest.json

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "fs";

const OUT_DIR = "data";
const OUT_FILE = `${OUT_DIR}/latest.json`;

const SOURCES = {
  vix: "https://th.investing.com/indices/us-spx-vix-futures",
  us10y: "https://www.investing.com/rates-bonds/u.s.-10-year-bond-yield",
  crudeOil: "https://www.investing.com/commodities/crude-oil",
  gold: "https://th.investing.com/currencies/xau-usd"
};

function log(...args) {
  console.log("[fetch]", ...args);
}

async function fetchHtml(url) {
  try {
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
  } catch (e) {
    log("WARN HTML:", url, String(e));
    return null;
  }
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
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGold(html) {
  const text = htmlToText(html);

  const price = firstMatchNumber(text, [
    /The current XAU\/USD exchange rate is\s*([0-9,]+\.\d+)/i,
    /What Is the Current XAU\/USD Exchange Rate\?\s*The current XAU\/USD exchange rate is\s*([0-9,]+\.\d+)/i
  ]);

  const prevClose = firstMatchNumber(text, [
    /with a previous close of\s*([0-9,]+\.\d+)/i,
    /Prev\.?\s*Close\s*([0-9,]+\.\d+)/i
  ]);

  return { price, prevClose };
}

function parseCrudeOil(html) {
  const text = htmlToText(html);

  const price = firstMatchNumber(text, [
    /The current price of Crude Oil WTI is\s*([0-9,]+\.\d+)/i,
    /What Is the Current Price of Crude Oil WTI\?\s*The current price of Crude Oil WTI is\s*([0-9,]+\.\d+)/i,
    /Crude Oil WTI Futures\s*([0-9,]+\.\d+)/i
  ]);

  const prevClose = firstMatchNumber(text, [
    /with a previous close of\s*([0-9,]+\.\d+)/i,
    /Prev\.?\s*Close\s*([0-9,]+\.\d+)/i
  ]);

  return { price, prevClose };
}

function parseUs10Y(html) {
  const text = htmlToText(html);

  const price = firstMatchNumber(text, [
    /The current price of U\.?S\.? 10 Year Treasury Yield is\s*([0-9,]+\.\d+)/i,
    /What Is the Current Price of U\.?S\.? 10 Year Treasury Yield\?\s*The current price of U\.?S\.? 10 Year Treasury Yield is\s*([0-9,]+\.\d+)/i,
    /U\.?S\.? 10 Year Treasury Yield\s*([0-9,]+\.\d{2,3})/i
  ]);

  const prevClose = firstMatchNumber(text, [
    /with a previous close of\s*([0-9,]+\.\d+)/i,
    /Prev\.?\s*Close\s*([0-9,]+\.\d{2,3})/i
  ]);

  return { price, prevClose };
}

function parseVix(html) {
  const text = htmlToText(html);

  const price = firstMatchNumber(text, [
    /The current price of S&P 500 VIX Futures is\s*([0-9,]+\.\d+)/i,
    /What Is the Current Price of S&P 500 VIX Futures\?\s*The current price of S&P 500 VIX Futures is\s*([0-9,]+\.\d+)/i,
    /S&P 500 VIX Futures\s*([0-9,]+\.\d+)/i
  ]);

  const prevClose = firstMatchNumber(text, [
    /with a previous close of\s*([0-9,]+\.\d+)/i,
    /Prev\.?\s*Close\s*([0-9,]+\.\d+)/i
  ]);

  return { price, prevClose };
}

function calcPct(price, prevClose) {
  if (price == null || prevClose == null || prevClose === 0) return null;
  return Number((((price - prevClose) / prevClose) * 100).toFixed(4));
}

async function main() {
  const [vixHtml, us10yHtml, crudeHtml, goldHtml] = await Promise.all([
    fetchHtml(SOURCES.vix),
    fetchHtml(SOURCES.us10y),
    fetchHtml(SOURCES.crudeOil),
    fetchHtml(SOURCES.gold)
  ]);

  let next = {
    ts: new Date().toISOString(),
    source: "investing",
    vix: vixHtml ? parseVix(vixHtml) : { price: null, prevClose: null },
    us10y: us10yHtml ? parseUs10Y(us10yHtml) : { price: null, prevClose: null },
    crudeOil: crudeHtml ? parseCrudeOil(crudeHtml) : { price: null, prevClose: null },
    gold: goldHtml ? parseGold(goldHtml) : { price: null, prevClose: null }
  };

  next.vix.pct = calcPct(next.vix.price, next.vix.prevClose);
  next.us10y.pct = calcPct(next.us10y.price, next.us10y.prevClose);
  next.crudeOil.pct = calcPct(next.crudeOil.price, next.crudeOil.prevClose);
  next.gold.pct = calcPct(next.gold.price, next.gold.prevClose);

  if (!existsSync(OUT_DIR)) {
    mkdirSync(OUT_DIR, { recursive: true });
  }

  if (existsSync(OUT_FILE)) {
    try {
      const prev = JSON.parse(readFileSync(OUT_FILE, "utf-8"));

      for (const key of ["vix", "us10y", "crudeOil", "gold"]) {
        if (!next[key]) next[key] = prev[key] ?? null;
        if (next[key].price == null) next[key].price = prev?.[key]?.price ?? null;
        if (next[key].prevClose == null) next[key].prevClose = prev?.[key]?.prevClose ?? null;
        if (next[key].pct == null) next[key].pct = prev?.[key]?.pct ?? null;
      }
    } catch {
      // noop
    }
  }

  writeFileSync(OUT_FILE, JSON.stringify(next, null, 2));
  log("Wrote", OUT_FILE);
  log(JSON.stringify(next, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
