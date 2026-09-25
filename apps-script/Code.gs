/**
 * Pitaka – forwards BPI alert emails from your Gmail to the Pitaka webhook.
 *
 * Setup (script.google.com → New project → paste this file):
 *   1. Project Settings → Script properties:
 *        WEBHOOK_URL    = https://<your-app>.vercel.app/api/ingest
 *        INGEST_SECRET  = same value as INGEST_SECRET in Vercel
 *        GMAIL_QUERY    = (optional) one extra Gmail search, used as-is
 *   2. Run `install` once and grant access. It checks for new emails every minute.
 *   3. Run `backfill` to import September. That is what writes to Pitaka.
 *
 * Re-sending an email is harmless: the server de-duplicates by Gmail message id.
 */

const DEFAULT_SENDERS = ['bpi.com.ph', 'bpiexpressonline.com'];
const DEFAULT_SUBJECTS = ['Interbank Funds Transfer Confirmation'];
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
  const afterSec = Math.floor((last - 24 * 3600 * 1000) / 1000);
  const messages = search_(clauses_().map((c) => c + ' after:' + afterSec), function (m) {
    return m.getDate().getTime() > last;
  });
  if (!messages.length) return;

  send_(messages);
  const newest = Math.max.apply(
    null,
    messages.map((m) => Date.parse(m.date)),
  );
  p.setProperty('LAST_SYNC_MS', String(newest));
}

/**
 * Import every matching alert in BACKFILL_YEAR / BACKFILL_MONTH.
 * This is the function that fills Pitaka. preview() only logs.
 */
function backfill() {
  const messages = monthMessages_();
  if (!messages.length) {
    throw new Error(
      'Gmail found 0 emails for ' +
        BACKFILL_YEAR +
        '-' +
        pad_(BACKFILL_MONTH) +
        '. Searched: ' +
        monthQueries_().join(' | ') +
        '. Use the same Google account that has the BPI mail. ' +
        'In Gmail try: subject:"Interbank Funds Transfer Confirmation"',
    );
  }
  send_(messages);
  console.log('Backfill sent ' + messages.length + ' emails');
}

/** Logs September matches. Does not write to Pitaka. */
function preview() {
  const queries = monthQueries_();
  const messages = monthMessages_();
  queries.forEach((q) => console.log('Search: ' + q));
  messages.forEach((m) => console.log(m.date + ' | ' + m.subject));
  console.log('Messages: ' + messages.length);
  if (!messages.length) {
    throw new Error('Gmail found 0 emails. Searched: ' + queries.join(' | '));
  }
}

/** Creates the every-minute trigger (safe to run more than once). */
function install() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'sync')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sync').timeBased().everyMinutes(1).create();
  sync();
  console.log('Installed. Pitaka will check Gmail every minute. Run backfill for September.');
}

function monthQueries_() {
  const y = BACKFILL_YEAR;
  const mo = BACKFILL_MONTH;
  const next = mo === 12 ? { y: y + 1, mo: 1 } : { y: y, mo: mo + 1 };
  const after = y + '/' + pad_(mo) + '/01';
  const before = next.y + '/' + pad_(next.mo) + '/01';
  return clauses_().map((c) => c + ' after:' + after + ' before:' + before);
}

function monthMessages_() {
  const y = BACKFILL_YEAR;
  const mo = BACKFILL_MONTH;
  const next = mo === 12 ? { y: y + 1, mo: 1 } : { y: y, mo: mo + 1 };
  const startBound = new Date(y, mo - 1, 1).getTime();
  const endBound = new Date(next.y, next.mo - 1, 1).getTime();
  return search_(monthQueries_(), function (m) {
    const ts = m.getDate().getTime();
    return ts >= startBound && ts < endBound;
  });
}

/**
 * One simple Gmail clause per sender / subject.
 * Gmail silently drops date filters when they sit next to OR, so we never OR them.
 */
function clauses_() {
  const override = props_().getProperty('GMAIL_QUERY');
  if (override) return [override];

  const src = sources_();
  const out = [];
  src.senders.forEach((s) => out.push('from:' + s));
  src.subjects.forEach((s) => out.push('subject:"' + s + '"'));
  (src.keywords || []).forEach((k) => {
    if (!k || src.senders.indexOf(k) >= 0) return;
    if (/@|\.(com|ph|net|org)\b/i.test(k) && !/\s/.test(k)) out.push('from:' + k);
    else out.push('"' + String(k).replace(/"/g, '') + '"');
  });
  return out;
}

function sources_() {
  const p = props_();
  const url = p.getProperty('WEBHOOK_URL');
  const secret = p.getProperty('INGEST_SECRET');
  if (url && secret) {
    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + secret, 'Cache-Control': 'no-cache' },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText());
      if (data && (data.senders || data.subjects || data.keywords || data.query)) {
        p.setProperty('CACHED_SOURCES', res.getContentText());
        return normalizeSources_(data);
      }
    }
  }
  const cached = p.getProperty('CACHED_SOURCES');
  if (cached) {
    try {
      return normalizeSources_(JSON.parse(cached));
    } catch (e) {}
  }
  return { senders: DEFAULT_SENDERS, subjects: DEFAULT_SUBJECTS, keywords: [] };
}

function normalizeSources_(data) {
  const senders = Array.isArray(data.senders) && data.senders.length ? data.senders : DEFAULT_SENDERS;
  const subjects =
    Array.isArray(data.subjects) && data.subjects.length ? data.subjects : DEFAULT_SUBJECTS;
  const keywords = Array.isArray(data.keywords) ? data.keywords.filter(Boolean) : [];
  return { senders: senders, subjects: subjects, keywords: keywords };
}

function search_(queries, keep) {
  const seen = {};
  const out = [];
  queries.forEach((q) => {
    for (let start = 0; ; start += 20) {
      const threads = GmailApp.search(q, start, 20);
      threads.forEach((t) =>
        t.getMessages().forEach((m) => {
          const id = m.getId();
          if (seen[id] || !keep(m)) return;
          seen[id] = true;
          out.push(toPayload_(m));
        }),
      );
      if (threads.length < 20) break;
    }
  });
  return out;
}

function pad_(n) {
  return n < 10 ? '0' + n : String(n);
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
    if (code !== 200) throw new Error('Pitaka webhook returned ' + code + ': ' + res.getContentText());
    console.log(res.getContentText());
  }
}
