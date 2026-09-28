import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addCalendarDays,
  bankDueDate,
  cycleForDate,
  defaultCycle,
  nextPayDates,
  onTimePayDates,
  ordinal,
  payDaysLabel,
  paymentSchedule,
  shiftCycle,
  splitAmount,
  statementBill,
  statementDateOn,
} from "./billing";

test("ordinal days for statement copy", () => {
  assert.equal(ordinal(1), "1st");
  assert.equal(ordinal(2), "2nd");
  assert.equal(ordinal(3), "3rd");
  assert.equal(ordinal(11), "11th");
  assert.equal(ordinal(12), "12th");
  assert.equal(ordinal(22), "22nd");
});

test("payDaysLabel lists in-month terms", () => {
  assert.equal(payDaysLabel([15, 30]), "the 15th and 30th");
  assert.equal(payDaysLabel([22]), "the 22nd");
});

test("BPI cycle: statement every 2nd, due 20 days later", () => {
  const c = cycleForDate("2026-09-01", 2, [15, 30], 20);
  assert.deepEqual(c, { start: "2026-08-03", statement: "2026-09-02", end: "2026-09-02", due: "2026-09-22" });

  assert.equal(cycleForDate("2026-09-02", 2, [15, 30], 20).statement, "2026-09-02");
  assert.equal(cycleForDate("2026-09-03", 2, [15, 30], 20).statement, "2026-10-02");
  assert.equal(cycleForDate("2026-09-03", 2, [15, 30], 20).due, "2026-10-22");
  assert.equal(bankDueDate("2026-10-02", 20), "2026-10-22");
});

test("nextPayDates walks 15th then 30th after the statement", () => {
  assert.deepEqual(nextPayDates("2026-09-02", [15, 30], 4), [
    "2026-09-15",
    "2026-09-30",
    "2026-10-15",
    "2026-10-30",
  ]);
});

test("onTimePayDates drops pay days after the bank due date", () => {
  assert.deepEqual(onTimePayDates("2026-10-02", [15, 30], 20), ["2026-10-15"]);
  assert.deepEqual(onTimePayDates("2026-09-02", [15, 30], 28), ["2026-09-15", "2026-09-30"]);
});

test("default cycle stays on the billed statement until the bank due date", () => {
  assert.equal(defaultCycle("2026-09-22", 2, [15, 30], 20).statement, "2026-09-02");
  assert.equal(defaultCycle("2026-09-23", 2, [15, 30], 20).statement, "2026-10-02");
  assert.equal(defaultCycle("2026-09-01", 2, [15, 30], 20).statement, "2026-09-02");
});

test("shiftCycle walks statement months", () => {
  const c = cycleForDate("2026-09-01", 2, [15, 30], 20);
  assert.equal(shiftCycle(c, 2, [15, 30], 1, 20).statement, "2026-10-02");
  assert.equal(shiftCycle(c, 2, [15, 30], -1, 20).statement, "2026-08-02");
});

test("February clamping for late statement and pay days", () => {
  assert.equal(statementDateOn(2026, 2, 28), "2026-02-28");
  assert.equal(statementDateOn(2026, 2, 31), "2026-02-28");
  assert.equal(addCalendarDays("2026-01-28", 20), "2026-02-17");
  assert.deepEqual(nextPayDates("2026-01-31", [15, 30], 2), ["2026-02-15", "2026-02-28"]);
});

test("splitAmount puts leftover centavos on the last term", () => {
  assert.deepEqual(splitAmount(1000, 3), [333.33, 333.33, 333.34]);
  assert.deepEqual(splitAmount(100, 6), [16.66, 16.66, 16.66, 16.66, 16.66, 16.7]);
  assert.deepEqual(splitAmount(12000, 1), [12000]);
  assert.equal(
    splitAmount(99.99, 12).reduce((a, n) => a + n, 0),
    99.99,
  );
});

test("pay in full splits across 15th and 30th when both are on time", () => {
  const terms = paymentSchedule({
    total: 12000,
    planMonths: 1,
    statement: "2026-09-02",
    statementDay: 2,
    payDays: [15, 30],
    dueDays: 28,
  });
  assert.deepEqual(terms, [
    { term: 1, due: "2026-09-15", amount: 6000 },
    { term: 2, due: "2026-09-30", amount: 6000 },
  ]);
});

test("pay day after the due date is skipped so the statement is paid in full on time", () => {
  const terms = paymentSchedule({
    total: 4283.71,
    planMonths: 1,
    statement: "2026-10-02",
    statementDay: 2,
    payDays: [15, 30],
    dueDays: 20,
  });
  assert.deepEqual(terms, [{ term: 1, due: "2026-10-15", amount: 4283.71 }]);
});

test("3-month plan with two on-time pay days is six equal terms", () => {
  const terms = paymentSchedule({
    total: 12000,
    planMonths: 3,
    statement: "2026-09-02",
    statementDay: 2,
    payDays: [15, 30],
    dueDays: 28,
  });
  assert.equal(terms.length, 6);
  assert.deepEqual(
    terms.map((t) => t.due),
    ["2026-09-15", "2026-09-30", "2026-10-15", "2026-10-30", "2026-11-15", "2026-11-30"],
  );
  assert.ok(terms.every((t) => t.amount === 2000));
});

test("3-month plan with a late 30th is three payments on the 15th", () => {
  const terms = paymentSchedule({
    total: 12000,
    planMonths: 3,
    statement: "2026-10-02",
    statementDay: 2,
    payDays: [15, 30],
    dueDays: 20,
  });
  assert.deepEqual(
    terms.map((t) => t.due),
    ["2026-10-15", "2026-11-15", "2026-12-15"],
  );
  assert.deepEqual(
    terms.map((t) => t.amount),
    [4000, 4000, 4000],
  );
});

test("statement bill: pay this cycle vs 3-month split of cycle charges", () => {
  const cycle = cycleForDate("2026-09-01", 2, [15, 30], 28);
  const txns = [
    { id: 1, occurredOn: "2026-08-10", amount: 3000, direction: "out" as const, planMonths: null },
    { id: 2, occurredOn: "2026-08-20", amount: 9000, direction: "out" as const, planMonths: null },
    { id: 3, occurredOn: "2026-09-10", amount: 500, direction: "out" as const, planMonths: null },
  ];
  const full = statementBill({ cycle, statementDay: 2, payDays: [15, 30], dueDays: 28, planMonths: 1, txns });
  assert.equal(full.payInFull, 12000);
  assert.deepEqual(full.schedule, [
    { term: 1, due: "2026-09-15", amount: 6000 },
    { term: 2, due: "2026-09-30", amount: 6000 },
  ]);
  assert.equal(full.dueThisStatement, 12000);

  const three = statementBill({ cycle, statementDay: 2, payDays: [15, 30], dueDays: 28, planMonths: 3, txns });
  assert.equal(three.payInFull, 12000);
  assert.equal(three.schedule.length, 6);
  assert.equal(three.schedule[0]?.amount, 2000);
  assert.equal(
    three.schedule.reduce((a, t) => a + t.amount, 0),
    12000,
  );
});

test("statement bill with due +20 days puts the full amount on the 15th", () => {
  const cycle = cycleForDate("2026-10-02", 2, [15, 30], 20);
  assert.equal(cycle.statement, "2026-10-02");
  assert.equal(cycle.due, "2026-10-22");
  const bill = statementBill({
    cycle,
    statementDay: 2,
    payDays: [15, 30],
    dueDays: 20,
    planMonths: 1,
    txns: [{ id: 1, occurredOn: "2026-09-20", amount: 4283.71, direction: "out", planMonths: null }],
  });
  assert.deepEqual(bill.schedule, [{ term: 1, due: "2026-10-15", amount: 4283.71 }]);
  assert.equal(bill.dueThisStatement, 4283.71);
});

test("credits reduce what is due; later-cycle spend stays out", () => {
  const cycle = cycleForDate("2026-09-01", 2, [15, 30], 28);
  const bill = statementBill({
    cycle,
    statementDay: 2,
    payDays: [15, 30],
    dueDays: 28,
    planMonths: 1,
    txns: [
      { id: 1, occurredOn: "2026-08-15", amount: 5000, direction: "out", planMonths: null },
      { id: 2, occurredOn: "2026-08-25", amount: 1000, direction: "in", planMonths: null },
    ],
  });
  assert.equal(bill.payInFull, 4000);
  assert.equal(bill.dueThisStatement, 4000);
});
