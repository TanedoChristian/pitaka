export const DEFAULT_SENDERS = ["bpi.com.ph", "bpiexpressonline.com"];

/** Catch BPI confirmations even when Gmail's From domain is not exactly these. */
export const ALERT_SUBJECTS = ["Interbank Funds Transfer Confirmation"];

const SENDER_RE =
  /^(?:[a-z0-9._%+-]+@)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Domain or email for a Gmail `from:` clause. */
export function normalizeSender(raw: string) {
  let s = raw.trim().toLowerCase().replace(/^from:\s*/i, "").replace(/^mailto:/i, "");
  const angled = s.match(/<([^>]+)>/);
  if (angled) s = angled[1].trim();
  if (s.length > 80 || !SENDER_RE.test(s)) return null;
  return s;
}

export function gmailQuery(senders: string[]) {
  const list = senders.length ? senders : DEFAULT_SENDERS;
  const from = list.length === 1 ? `from:${list[0]}` : `from:(${list.join(" OR ")})`;
  const subjects = ALERT_SUBJECTS.map((s) => `subject:"${s}"`).join(" OR ");
  return `(${from} OR ${subjects})`;
}
