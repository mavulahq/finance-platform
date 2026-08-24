import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  calculateCompoundInterest,
  calculateDailyAccrualInterest,
  calculateEAR,
  calculateInterestWithGrace,
  calculateOverdraftInterest,
  calculatePMT,
} = require("../packages/ledger-core/dist/calculations/financial-calculations.js");

test("compound interest follows A = P(1 + r/n)^(nt) minus principal", () => {
  const principal = 10000;
  const annualRate = 0.12;
  const compoundingFrequency = 12;
  const timeInYears = 1;
  const expected = Number(
    (principal * (1 + annualRate / compoundingFrequency) ** (compoundingFrequency * timeInYears) - principal).toFixed(2),
  );

  assert.equal(
    calculateCompoundInterest({
      principal,
      annualRate,
      compoundingFrequency,
      timeInYears,
    }),
    expected,
  );
  assert.equal(expected, 1268.25);
  assert.equal(
    calculateCompoundInterest({
      principal: 10000,
      annualRate: 0.12,
      compoundingFrequency: 1,
      timeInYears: 1,
    }),
    1200,
  );
});

test("daily accrual interest is balance × daily rate × days, rounded to cents", () => {
  assert.equal(
    calculateDailyAccrualInterest({
      balance: 10000,
      dailyRate: 0.0002,
      daysInPeriod: 30,
    }),
    60,
  );
  assert.equal(
    calculateDailyAccrualInterest({
      balance: 0,
      dailyRate: 0.0002,
      daysInPeriod: 30,
    }),
    0,
  );
});

test("EAR converts a monthly rate with six-decimal precision", () => {
  assert.equal(calculateEAR(0.01), 0.126825);
  assert.equal(calculateEAR(0), 0);
});

test("overdraft interest adds the optional fee after daily accrual", () => {
  assert.equal(
    calculateOverdraftInterest({
      overdraft_amount: 500,
      daily_overdraft_rate: 0.0005,
      daysOverdrawn: 10,
    }),
    2.5,
  );
  assert.equal(
    calculateOverdraftInterest({
      overdraft_amount: 500,
      daily_overdraft_rate: 0.0005,
      daysOverdrawn: 10,
      overdraft_fee: 15,
    }),
    17.5,
  );
});

test("grace-period interest accrues only after the interest-free months", () => {
  const principal = 12000;
  const monthlyRate = 0.01;
  const gracePeriodMonths = 3;
  const totalMonths = 12;
  const periodsWithInterest = totalMonths - gracePeriodMonths;
  const pmt = calculatePMT(principal, monthlyRate, periodsWithInterest);
  const expected = Number((pmt * periodsWithInterest - principal).toFixed(2));

  assert.equal(
    calculateInterestWithGrace({
      principal,
      monthlyRate,
      gracePeriodMonths,
      totalMonths,
    }),
    expected,
  );
  assert.equal(
    calculateInterestWithGrace({
      principal,
      monthlyRate,
      gracePeriodMonths: 12,
      totalMonths: 12,
    }),
    0,
  );
  assert.ok(expected > 0);
});
