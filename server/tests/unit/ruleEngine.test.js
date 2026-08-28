import { test, describe } from 'node:test';
import assert from 'node:assert';

import { AIClient, PIIRedactor }  from '../../src/ai/aiClient.js';
import { RuleEngineService }      from '../../src/services/ruleEngine.service.js';

describe('GrootAi Rule Engine & AST Parser Unit Tests', () => {
  const sampleColumns = [
    { name: 'customerEmail', inferredType: 'string', sampleValues: ['test@example.com', 'alice@corp.in'] },
    { name: 'phone', inferredType: 'string', sampleValues: ['9876543210', '+91-98765-43210'] },
    { name: 'annualRevenue', inferredType: 'number', sampleValues: [500000, 1200000] },
    { name: 'status', inferredType: 'string', sampleValues: ['active', 'pending'] },
    { name: 'gstin', inferredType: 'string', sampleValues: ['29ABCDE1234F1Z5'] },
    { name: 'pan', inferredType: 'string', sampleValues: ['ABCDE1234F'] },
    { name: 'pinCode', inferredType: 'string', sampleValues: ['560001'] },
  ];

  test('1. Empty or ambiguous input defaults to not_null condition', () => {
    const res = AIClient.deterministicASTParser('', sampleColumns);
    assert.strictEqual(res.structuredRule.conditions.length, 1);
    assert.strictEqual(res.structuredRule.conditions[0].operator, 'not_null');
  });

  test('2. Translates email validation phrase to email_valid operator', () => {
    const res = AIClient.deterministicASTParser('customerEmail must be a valid email format', sampleColumns);
    const cond = res.structuredRule.conditions.find(c => c.operator === 'email_valid');
    assert.ok(cond, 'Should contain email_valid operator');
    assert.strictEqual(cond.field, 'customerEmail');
  });

  test('3. Translates phone format requirements to phone_valid operator', () => {
    const res = AIClient.deterministicASTParser('phone number must follow valid international standard format', sampleColumns);
    const cond = res.structuredRule.conditions.find(c => c.operator === 'phone_valid');
    assert.ok(cond, 'Should contain phone_valid operator');
  });

  test('4. Translates positive revenue requirement to min operator', () => {
    const res = AIClient.deterministicASTParser('annualRevenue must be positive and greater than 0', sampleColumns);
    const cond = res.structuredRule.conditions.find(c => c.operator === 'min');
    assert.ok(cond, 'Should contain min operator');
    assert.ok(cond.minValue > 0, 'Min value must be > 0');
  });

  test('5. Translates under/max threshold to max operator', () => {
    const res = AIClient.deterministicASTParser('annualRevenue must be under 5000000', sampleColumns);
    const cond = res.structuredRule.conditions.find(c => c.operator === 'max');
    assert.ok(cond, 'Should contain max operator');
    assert.strictEqual(cond.maxValue, 5000000);
  });

  test('6. Translates between X and Y to range operator', () => {
    const res = AIClient.deterministicASTParser('annualRevenue between 100000 and 2000000', sampleColumns);
    const cond = res.structuredRule.conditions.find(c => c.operator === 'range');
    assert.ok(cond, 'Should contain range operator');
    assert.strictEqual(cond.minValue, 100000);
    assert.strictEqual(cond.maxValue, 2000000);
  });

  test('7. Translates allowed status list to in_set operator', () => {
    const res = AIClient.deterministicASTParser('status must be active, suspended, or pending', sampleColumns);
    const cond = res.structuredRule.conditions.find(c => c.operator === 'in_set');
    assert.ok(cond, 'Should contain in_set operator');
    assert.ok(cond.set.includes('active'));
    assert.ok(cond.set.includes('pending'));
  });

  test('8. Translates unique requirement to unique operator', () => {
    const res = AIClient.deterministicASTParser('customerEmail must be unique with no duplicates', sampleColumns);
    const cond = res.structuredRule.conditions.find(c => c.operator === 'unique');
    assert.ok(cond, 'Should contain unique operator');
  });

  test('9. Generates valid 15-character GSTIN regex rule', () => {
    const res = AIClient.deterministicASTParser('gstin must follow valid GST format', sampleColumns);
    const cond = res.structuredRule.conditions.find(c => c.operator === 'regex');
    assert.ok(cond, 'Should contain regex operator');
  });

  test('10. Generates valid 10-character PAN format regex rule', () => {
    const res = AIClient.deterministicASTParser('pan must follow valid PAN format', sampleColumns);
    const cond = res.structuredRule.conditions.find(c => c.operator === 'regex');
    assert.ok(cond, 'Should contain regex operator');
  });

  test('11. Generates 6-digit PIN code regex rule', () => {
    const res = AIClient.deterministicASTParser('pinCode must be a valid 6 digit format', sampleColumns);
    const cond = res.structuredRule.conditions.find(c => c.operator === 'regex');
    assert.ok(cond, 'Should contain regex operator');
    assert.strictEqual(cond.pattern, '^[1-9][0-9]{5}$');
  });

  test('12. Execute-Before-Trust flags pathological rules with <20% pass rate', () => {
    const sampleRecords = [
      { data: { annualRevenue: -100 } },
      { data: { annualRevenue: -500 } },
      { data: { annualRevenue: -200 } },
      { data: { annualRevenue: 1000 } },
    ];
    const strictRule = {
      logic: 'AND',
      conditions: [{ field: 'annualRevenue', operator: 'min', minValue: 5000 }],
    };
    const safetyCheck = RuleEngineService.validateCandidateRule(strictRule, sampleRecords);
    assert.strictEqual(safetyCheck.passRate, 0);
    assert.strictEqual(safetyCheck.flaggedAsUnsafe, true);
  });

  test('13. Execute-Before-Trust approves clean rule on valid data', () => {
    const sampleRecords = [
      { data: { customerEmail: 'alice@corp.com' } },
      { data: { customerEmail: 'bob@corp.com' } },
    ];
    const safeRule = {
      logic: 'AND',
      conditions: [{ field: 'customerEmail', operator: 'email_valid' }],
    };
    const safetyCheck = RuleEngineService.validateCandidateRule(safeRule, sampleRecords);
    assert.strictEqual(safetyCheck.passRate, 100);
    assert.strictEqual(safetyCheck.flaggedAsUnsafe, false);
  });

  test('14. RunRuleOnDataset returns violations with exact row details', () => {
    const records = [
      { _id: 'rec_1', rowNumber: 1, datasetId: 'ds_1', data: { customerEmail: 'valid@corp.com' } },
      { _id: 'rec_2', rowNumber: 2, datasetId: 'ds_1', data: { customerEmail: 'invalid..email' } },
    ];
    const rule = {
      _id: 'rule_1',
      name: 'Email Check',
      severity: 'high',
      structuredRule: {
        logic: 'AND',
        conditions: [{ field: 'customerEmail', operator: 'email_valid' }],
      },
    };
    const violations = RuleEngineService.runRuleOnDataset(rule, records);
    assert.strictEqual(violations.length, 1);
    assert.strictEqual(violations[0].rowNumber, 2);
    assert.strictEqual(violations[0].field, 'customerEmail');
  });

  test('15. PIIRedactor correctly redacts emails, phones, and tax IDs', () => {
    const maskedEmail = PIIRedactor.maskEmail('john.doe@company.com');
    assert.strictEqual(maskedEmail, 'j***e@company.com');

    const maskedPhone = PIIRedactor.maskPhone('+91 9876543210');
    assert.strictEqual(maskedPhone, '***-***-3210');

    const maskedTax = PIIRedactor.maskTaxId('29ABCDE1234F1Z5');
    assert.strictEqual(maskedTax, '29***Z5');
  });
});
