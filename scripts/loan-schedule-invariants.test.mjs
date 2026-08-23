import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  allocatePayment,
  calculatePMT,
  generateAmortizationSchedule,
  getMonthlyRateFromAPR,
  validateLoanParameters,
} = require("../packages/ledger-core/dist/calculations/financial-calculations.js");

const PRINCIPAL = 12000;
const MONTHLY_RATE = getMonthlyRateFromAPR(24);
const TERM = 12;
const START = new Date("2026-01-15T00:00:00.000Z");

function schedule() {
  return generateAmortizationSchedule({
    principal: PRINCIPAL,
    monthlyRate: MONTHLY_RATE,
    n: TERM,
    startDate: START,
  });
}

test("amortization interest declines with remaining principal, not the original balance", () => {
  const items = schedule();

  assert.equal(items.length, TERM);
  assert.equal(items[0].opening_balance, PRINCIPAL);
  assert.equal(items[1].opening_balance, items[0].closing_balance);
  assert.ok(items[1].interest < items[0].interest);
  assert.ok(items[TERM - 1].interest < items[1].interest);
  assert.ok(items[TERM - 1].closing_balance < 1);
});

test("a posted first installment leaves the second period accruing on the remaining balance", () => {
  const items = schedule();
  const first = items[0];
  const posted = allocatePayment({
    payment_amount: first.payment + first.fees,
    interest_due: first.interest,
    principal_due: first.principal,
    fees_due: first.fees,
    current_balance: first.opening_balance,
  });

  assert.equal(posted.interest_payment, first.interest);
  assert.equal(posted.principal_payment, first.principal);
  assert.equal(posted.balance_after, first.closing_balance);

  const nextInterestDue = items[1].interest;
  const remainingTimesRate = Number((posted.balance_after * MONTHLY_RATE).toFixed(2));
  assert.equal(nextInterestDue, remainingTimesRate);
  assert.notEqual(nextInterestDue, Number((PRINCIPAL * MONTHLY_RATE).toFixed(2)));
});

test("zero-rate PMT splits principal evenly and validateLoanParameters fail-closes bad inputs", () => {
  assert.equal(calculatePMT(1200, 0, 12), 100);
  assert.deepEqual(validateLoanParameters({ principal: 0, monthlyRate: 0.02, installmentCount: 12 }), {
    valid: false,
    errors: ["Principal must be positive"],
  });
  assert.equal(
    validateLoanParameters({ principal: 1000, monthlyRate: 0.6, installmentCount: 12 }).valid,
    false,
  );
  assert.equal(
    validateLoanParameters({ principal: 1000, monthlyRate: 0.02, installmentCount: 0 }).valid,
    false,
  );
  assert.equal(
    validateLoanParameters({ principal: 1000, monthlyRate: 0.02, installmentCount: 12 }).valid,
    true,
  );
});
