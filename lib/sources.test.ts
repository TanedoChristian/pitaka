import { test } from "node:test";
import assert from "node:assert/strict";
import { gmailQuery, normalizeSender } from "./sources";

test("normalizeSender accepts domains and emails", () => {
  assert.equal(normalizeSender("gcash.com"), "gcash.com");
  assert.equal(normalizeSender("  From: Maya.ph  "), "maya.ph");
  assert.equal(normalizeSender("Maya <alerts@maya.ph>"), "alerts@maya.ph");
  assert.equal(normalizeSender("mailto:noreply@gcash.com"), "noreply@gcash.com");
});

test("normalizeSender rejects junk", () => {
  assert.equal(normalizeSender(""), null);
  assert.equal(normalizeSender("not a domain"), null);
  assert.equal(normalizeSender("javascript:alert(1)"), null);
});

test("gmailQuery builds from: with OR and known subjects", () => {
  assert.equal(
    gmailQuery(["bpi.com.ph"]),
    '(from:bpi.com.ph OR subject:"Interbank Funds Transfer Confirmation")',
  );
  assert.equal(
    gmailQuery(["bpi.com.ph", "gcash.com"]),
    '(from:(bpi.com.ph OR gcash.com) OR subject:"Interbank Funds Transfer Confirmation")',
  );
  assert.equal(
    gmailQuery([]),
    '(from:(bpi.com.ph OR bpiexpressonline.com) OR subject:"Interbank Funds Transfer Confirmation")',
  );
});

test("gmailQuery adds card keywords that are not already senders", () => {
  assert.equal(
    gmailQuery(["bpi.com.ph"], ["bpi.com.ph", "eastwest alert", "maya.ph"]),
    '(from:bpi.com.ph OR subject:"Interbank Funds Transfer Confirmation" OR "eastwest alert" OR from:maya.ph)',
  );
});
