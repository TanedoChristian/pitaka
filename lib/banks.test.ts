import { test } from "node:test";
import assert from "node:assert/strict";
import { BANKS, isBankId, matchAccount, normalizeKeyword, paymentChoices, senderMatchesKeyword } from "./banks";

test("catalog covers the Philippine banks we support", () => {
  assert.deepEqual(
    BANKS.map((b) => b.id),
    ["bpi", "eastwest", "maya", "gotyme", "unionbank"],
  );
  assert.equal(isBankId("bpi"), true);
  assert.equal(isBankId("cash"), false);
});

test("normalizeKeyword accepts senders and short phrases", () => {
  assert.equal(normalizeKeyword("  BPI.com.ph  "), "bpi.com.ph");
  assert.equal(normalizeKeyword("EastWest Alert"), "eastwest alert");
  assert.equal(normalizeKeyword("from:alerts@maya.ph"), "alerts@maya.ph");
  assert.equal(normalizeKeyword(""), null);
  assert.equal(normalizeKeyword("!!!"), null);
});

test("paymentChoices always offers Cash plus every bank not yet added", () => {
  const { cash, cards, pending } = paymentChoices([
    { id: 1, bank: "cash", card_type: "cash", nickname: "Cash", last4: null },
    { id: 2, bank: "bpi", card_type: "debit", nickname: "Everyday", last4: "8821" },
  ]);
  assert.equal(cash?.id, 1);
  assert.equal(cards.length, 1);
  assert.deepEqual(
    pending.map((b) => b.id),
    ["eastwest", "maya", "gotyme", "unionbank"],
  );
});

test("senderMatchesKeyword matches the From domain saved on the card", () => {
  assert.equal(senderMatchesKeyword("BPI Alerts <noreply@bpi.com.ph>", "bpi.com.ph"), true);
  assert.equal(senderMatchesKeyword("alerts@bpiexpressonline.com", "bpi.com.ph"), false);
  assert.equal(senderMatchesKeyword("Maya <alerts@maya.ph>", "maya.ph"), true);
  assert.equal(senderMatchesKeyword("BPI Alerts <noreply@bpi.com.ph>", "maya.ph"), false);
});

test("matchAccount uses From + card keyword, then last 4, then BPI subject hints", () => {
  const accounts = [
    { bank: "bpi", keyword: "bpi.com.ph", last4: "8821" },
    { bank: "maya", keyword: "maya.ph", last4: "4400" },
    { bank: "cash", keyword: null, last4: null },
  ];
  assert.equal(
    matchAccount(accounts, { from: "noreply@bpi.com.ph", subject: "Purchase alert", body: "paid at Jollibee" }),
    accounts[0],
  );
  assert.equal(
    matchAccount(accounts, { from: "BPI <alerts@bpiexpressonline.com>", subject: "Purchase alert", body: "" }),
    accounts[0],
  );
  assert.equal(
    matchAccount(accounts, {
      from: "",
      subject: "Interbank Funds Transfer Confirmation",
      body: "Transfer To Maya Wallet PHP 100.00",
    }),
    accounts[0],
  );
  assert.equal(
    matchAccount(accounts, { from: "", subject: "Purchase alert", body: "card ending in 4400" , last4: "4400" }),
    accounts[1],
  );
  assert.equal(
    matchAccount(accounts, { from: "promos@shop.ph", subject: "Sale", body: "nothing relevant" }),
    null,
  );
});
