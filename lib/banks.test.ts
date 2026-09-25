import { test } from "node:test";
import assert from "node:assert/strict";
import { BANKS, isBankId, matchAccount, normalizeKeyword, paymentChoices } from "./banks";

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

test("matchAccount prefers last 4, then the longest keyword hit", () => {
  const accounts = [
    { keyword: "bpi.com.ph", last4: "8821" },
    { keyword: "maya.ph", last4: "4400" },
    { keyword: "bpi", last4: null },
  ];
  assert.equal(matchAccount(accounts, "purchase at Jollibee", "4400"), accounts[1]);
  assert.equal(matchAccount(accounts, "From: noreply@bpi.com.ph — paid PHP 100", null), accounts[0]);
  assert.equal(matchAccount(accounts, "random promo email", null), null);
});
