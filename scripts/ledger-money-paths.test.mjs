import assert from "node:assert/strict";
import test from "node:test";
import { allocatePayment } from "../packages/ledger-core/dist/calculations/financial-calculations.js";
import {
  evaluateBooleanExpression,
  evaluateNumericExpression,
} from "../packages/ledger-core/dist/utils/safe-expression-evaluator.js";

test("allocatePayment pays fees before interest and principal", () => {
  assert.deepEqual(
    allocatePayment({
      payment_amount: 40,
      fees_due: 50,
      interest_due: 20,
      principal_due: 100,
      current_balance: 100,
    }),
    {
      fee_payment: 40,
      interest_payment: 0,
      principal_payment: 0,
      balance_after: 100,
    },
  );
});

test("allocatePayment applies leftover to interest after fees", () => {
  assert.deepEqual(
    allocatePayment({
      payment_amount: 60,
      fees_due: 50,
      interest_due: 20,
      principal_due: 100,
      current_balance: 100,
    }),
    {
      fee_payment: 50,
      interest_payment: 10,
      principal_payment: 0,
      balance_after: 100,
    },
  );
});

test("allocatePayment reduces balance only by principal actually applied", () => {
  assert.deepEqual(
    allocatePayment({
      payment_amount: 180,
      fees_due: 10,
      interest_due: 20,
      principal_due: 100,
      current_balance: 250,
    }),
    {
      fee_payment: 10,
      interest_payment: 20,
      principal_payment: 100,
      balance_after: 150,
    },
  );
});

test("allocatePayment drops remainder above principal_due instead of over-reducing the balance", () => {
  assert.deepEqual(
    allocatePayment({
      payment_amount: 500,
      fees_due: 0,
      interest_due: 0,
      principal_due: 80,
      current_balance: 80,
    }),
    {
      fee_payment: 0,
      interest_payment: 0,
      principal_payment: 80,
      balance_after: 0,
    },
  );
});

test("allocatePayment keeps a zero payment from changing allocations or balance", () => {
  assert.deepEqual(
    allocatePayment({
      payment_amount: 0,
      fees_due: 5,
      interest_due: 5,
      principal_due: 50,
      current_balance: 50,
    }),
    {
      fee_payment: 0,
      interest_payment: 0,
      principal_payment: 0,
      balance_after: 50,
    },
  );
});

test("evaluateNumericExpression rounds money formulas and treats divide-by-zero as zero", () => {
  assert.equal(evaluateNumericExpression("round(percent(1000, 2.5), 2)", {}), 25);
  assert.equal(evaluateNumericExpression("10 / 0", {}), 0);
  assert.equal(evaluateNumericExpression("10 % 0", {}), 0);
});

test("evaluateBooleanExpression fail-closes on missing fields and allows blank conditions", () => {
  assert.equal(evaluateBooleanExpression("", {}), true);
  assert.equal(
    evaluateBooleanExpression('amount >= 100 && status == "ACTIVE"', { amount: 150 }),
    false,
  );
  assert.equal(
    evaluateBooleanExpression('amount >= 100 && status == "ACTIVE"', {
      amount: 150,
      status: "ACTIVE",
    }),
    true,
  );
});

test("evaluateNumericExpression rejects unsupported tokens", () => {
  assert.throws(() => evaluateNumericExpression("1 $ 2", {}), /Unsupported expression token/);
});
