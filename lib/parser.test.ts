// Samples are illustrative — BPI's exact wording varies. Add your real
// (redacted) alert emails here as you see new formats.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBpiEmail } from "./parser";
import { categorize } from "./categories";

test("outgoing fund transfer", () => {
  const p = parseBpiEmail({
    subject: "BPI Fund Transfer Confirmation",
    body: "You have successfully transferred PHP 1,500.00 from your account ending in 1234 to JUAN DELA CRUZ on Sep 24, 2026. Ref no. 8812.",
  });
  assert.equal(p?.amount, 1500);
  assert.equal(p?.direction, "out");
  assert.equal(p?.account, "1234");
  assert.equal(p?.merchant, "JUAN DELA CRUZ");
});

test("incoming credit ignores the balance amount", () => {
  const p = parseBpiEmail({
    subject: "Account Credited",
    body: "Your account XXXX-XXX-5678 has been credited with Php 25,000.00 from ACME CORP PAYROLL. Available balance: PHP 40,112.35",
  });
  assert.equal(p?.amount, 25000);
  assert.equal(p?.direction, "in");
  assert.equal(p?.account, "5678");
  assert.equal(p?.merchant, "ACME CORP PAYROLL");
  assert.equal(categorize(`${p?.description} ${p?.merchant}`, "in", []), "Salary");
});

test("bills payment", () => {
  const p = parseBpiEmail({
    subject: "Bills Payment",
    body: "You paid ₱2,345.10 to MERALCO using your BPI account ending 9999.",
  });
  assert.equal(p?.amount, 2345.1);
  assert.equal(p?.direction, "out");
  assert.equal(p?.merchant, "MERALCO");
  assert.equal(categorize(`${p?.merchant}`, "out", []), "Bills & Utilities");
});

test("debit card purchase", () => {
  const p = parseBpiEmail({
    subject: "Purchase alert",
    body: "A purchase of PHP 389.00 was made at JOLLIBEE SM NORTH on 09/25/2026 with your card ending in 4321.",
  });
  assert.equal(p?.amount, 389);
  assert.equal(p?.direction, "out");
  assert.equal(p?.merchant, "JOLLIBEE SM NORTH");
});

test("non-transaction email is skipped", () => {
  assert.equal(
    parseBpiEmail({ subject: "Your OTP", body: "Your one-time PIN is 123456. Do not share it." }),
    null,
  );
});

test("real sample: InstaPay interbank transfer (table email)", () => {
  const body = `Dear CHRISTIAN,

You have successfully submitted your InstaPay Funds Transfer request with the following details.

Interbank Funds Transfer Transaction Details
Confirmation Number\t1626719248123
Transaction Date and Time\tThursday, Sep 24 2026; 07:10:53 PM (GMT +8)
Transfer From\tXXXX-XXXX-882 (SAVINGS ACCOUNT)
Transfer To\t63XXXXX97323
Bank Name\tMaya Wallet/Maya Philippines
Transfer Amount\tPHP 100.00
Service Fee\tPHP 0.00
Total Amount\tPHP 100.00
Transfer Service\tINSTAPAY
Transaction Ref No.\t303561
Notes\t`;
  for (const b of [body, body.replace(/\t/g, "\n"), body.replace(/\t/g, ": ")]) {
    const p = parseBpiEmail({ subject: "Interbank Funds Transfer Confirmation", body: b });
    assert.equal(p?.amount, 100);
    assert.equal(p?.direction, "out");
    assert.equal(p?.account, "882");
    assert.equal(p?.merchant, "Maya Wallet/Maya Philippines · 63XXXXX97323");
    assert.equal(p?.occurredAt?.toISOString(), "2026-09-24T11:10:53.000Z");
    assert.equal(categorize(`${p?.description} ${p?.merchant}`, "out", []), "Transfers");
  }
});

test("real sample: InstaPay to GCash", () => {
  const p = parseBpiEmail({
    subject: "Interbank Funds Transfer Confirmation",
    body: `Dear CHRISTIAN,

You have successfully submitted your InstaPay Funds Transfer request with the following details.

Interbank Funds Transfer Transaction Details
Confirmation Number	1626515680195
Transaction Date and Time	Tuesday, Sep 22 2026; 03:23:05 PM (GMT +8)
Transfer From	XXXX-XXXX-882 (SAVINGS ACCOUNT)
Transfer To	DWXXXXX3JDNWHNTPY
Bank Name	GCash/G-Xchange
Transfer Amount	PHP 125.00
Service Fee	PHP 0.00
Total Amount	PHP 125.00
Transfer Service	INSTAPAY
Transaction Ref No.	907517
Notes	`,
  });
  assert.equal(p?.amount, 125);
  assert.equal(p?.direction, "out");
  assert.equal(p?.merchant, "GCash/G-Xchange · DWXXXXX3JDNWHNTPY");
  assert.equal(p?.occurredAt?.toISOString(), "2026-09-22T07:23:05.000Z");
});

test("table email: total includes the service fee", () => {
  const p = parseBpiEmail({
    subject: "Interbank Funds Transfer Confirmation",
    body: "Transfer From XXXX-1234 Transfer To 0917XXXX Bank Name GCash Transfer Amount PHP 1,000.00 Service Fee PHP 15.00 Total Amount PHP 1,015.00 Notes rent",
  });
  assert.equal(p?.amount, 1015);
  assert.equal(p?.description, "Interbank Funds Transfer Confirmation — rent");
});

test("html-only purchase alert is parsed after tags are stripped", () => {
  const p = parseBpiEmail({
    subject: "Purchase alert",
    body: `<html><body><p>A purchase of <b>PHP 389.00</b> was made at JOLLIBEE SM NORTH on 09/25/2026 with your card ending in 4321.</p></body></html>`,
  });
  assert.equal(p?.amount, 389);
  assert.equal(p?.direction, "out");
  assert.equal(p?.merchant, "JOLLIBEE SM NORTH");
});

test("user rules beat built-ins", () => {
  assert.equal(
    categorize("GRAB PH", "out", [{ id: 1, keyword: "grab", category: "Food & Dining" }]),
    "Food & Dining",
  );
});
