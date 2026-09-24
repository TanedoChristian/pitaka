/**
 * Pitaka – forwards BPI alert emails from your Gmail to the Pitaka webhook.
 *
 * Setup (script.google.com → New project → paste this file):
 *   1. Project Settings → Script properties:
 *        WEBHOOK_URL    = https://<your-app>.vercel.app/api/ingest
 *        INGEST_SECRET  = same value as INGEST_SECRET in Vercel
 *        GMAIL_QUERY    = (optional) defaults to BPI senders
 *   2. Run `install` once and grant access. It checks for new emails every minute.
 *   3. Run `backfill` to import September (re-run if it pauses — it resumes).
 *
 * Re-sending an email is harmless: the server de-duplicates by Gmail message id.
 */

const DEFAULT_QUERY = 'from:(bpi.com.ph OR bpiexpressonline.com)';
const BATCH = 15;

// Full-month backfill target. Change these and re-run `backfill` for another month.
const BACKFILL_YEAR = 2026;
const BACKFILL_MONTH = 9; // September

function props_() {
  return PropertiesService.getScriptProperties();
}

/** Runs every minute: sends emails newer than the last one sent. */
function sync() {
  const p = props_();
  const last = Number(p.getProperty('LAST_SYNC_MS') || 0) || Date.now() - 24 * 3600 * 1000;
  // Gmail's after: is day-granular in practice, so look back a day and filter by time here.
  const afterSec = Math.floor((last - 24 * 3600 * 1000) / 1000);
  const messages = collect_(`${query_()} after:${afterSec}`, (m) => m.getDate().getTime() > last);
  if (!messages.length) return;

  send_(messages);
  const newest = Math.max.apply(null, messages.map((m) => Date.parse(m.date)));
  p.setProperty('LAST_SYNC_MS', String(newest));
}

/**
 * Import every BPI alert in BACKFILL_YEAR / BACKFILL_MONTH.
 * Safe to re-run: it resumes from the last thread page and the server de-dups.
 */
function backfill() {
  const y = BACKFILL_YEAR;
  const mo = BACKFILL_MONTH;
  const next = mo === 12 ? { y: y + 1, mo: 1 } : { y: y, mo: mo + 1 };
  const after = `${y}/${pad_(mo)}/01`;
  const before = `${next.y}/${pad_(next.mo)}/01`;
  const startBound = new Date(y, mo - 1, 1).getTime();
  const endBound = new Date(next.y, next.mo - 1, 1).getTime();

  const p = props_();
  const cursorKey = `BACKFILL_${y}_${pad_(mo)}_THREAD`;
  let start = Number(p.getProperty(cursorKey) || 0);
  let sent = 0;

  for (;;) {
    const threads = GmailApp.search(`${query_()} after:${after} before:${before}`, start, 20);
    if (!threads.length) break;

    const batch = [];
    threads.forEach((t) =>
      t.getMessages().forEach((m) => {
        const ts = m.getDate().getTime();
        if (ts < startBound || ts >= endBound) return;
        batch.push(toPayload_(m));
      }),
    );
    if (batch.length) {
      send_(batch);
      sent += batch.length;
    }
    start += threads.length;
    p.setProperty(cursorKey, String(start));
    if (threads.length < 20) break;
  }

  p.deleteProperty(cursorKey);
  console.log(`Backfill ${y}-${pad_(mo)} sent ${sent} emails`);
}

/** Clears a paused September (or current BACKFILL_*) run so the next `backfill` starts over. */
function resetBackfill() {
  const key = `BACKFILL_${BACKFILL_YEAR}_${pad_(BACKFILL_MONTH)}_THREAD`;
  props_().deleteProperty(key);
  console.log('Backfill cursor cleared. Run backfill again.');
}

/** Creates the every-minute trigger (safe to run more than once). */
function install() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'sync')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(1).create();
  sync();
  console.log('Installed. Pitaka will check Gmail every minute.');
}

function query_() {
  return props_().getProperty('GMAIL_QUERY') || DEFAULT_QUERY;
}

function pad_(n) {
  return n < 10 ? '0' + n : String(n);
}

function collect_(q, keep) {
  const out = [];
  for (let start = 0; ; start += 100) {
    const threads = GmailApp.search(q, start, 100);
    threads.forEach((t) =>
      t.getMessages().forEach((m) => {
        if (!keep(m)) return;
        out.push(toPayload_(m));
      }),
    );
    if (threads.length < 100) break;
  }
  return out;
}

function toPayload_(m) {
  return {
    id: m.getId(),
    subject: m.getSubject(),
    body: textOf_(m),
    date: m.getDate().toISOString(),
  };
}

/** Prefer plain text; fall back to stripped HTML so HTML-only BPI alerts still parse. */
function textOf_(m) {
  const plain = m.getPlainBody() || '';
  if (/(?:PHP|Php|₱|\bP\s?\d)/.test(plain)) return plain;
  return stripHtml_(m.getBody() || plain);
}

function stripHtml_(html) {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li|\/table)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#8369;|&peso;/gi, '₱')
    .replace(/&quot;/g, '"');
}

function send_(messages) {
  const p = props_();
  const url = p.getProperty('WEBHOOK_URL');
  const secret = p.getProperty('INGEST_SECRET');
  if (!url || !secret) throw new Error('Set WEBHOOK_URL and INGEST_SECRET in Script properties');

  for (let i = 0; i < messages.length; i += BATCH) {
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + secret },
      payload: JSON.stringify({ messages: messages.slice(i, i + BATCH) }),
      muteHttpExceptions: true,
    });
    const code = res.getResponseCode();
    // Throwing keeps LAST_SYNC_MS / the backfill cursor unchanged, so the next run retries.
    if (code !== 200) throw new Error('Pitaka webhook returned ' + code + ': ' + res.getContentText());
    console.log(res.getContentText());
  }
}
