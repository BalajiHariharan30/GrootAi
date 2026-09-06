import { cache } from '../cache/redisClient.js';

export class RuleEngineService {
  /**
   * Tests a single condition against a record's data
   */
  static evaluateCondition(condition, recordData, allDatasetRecords = []) {
    const { field, operator, value, minValue, maxValue, pattern, set, negate } = condition;
    const fieldValue = recordData[field];

    let isMatch = true;

    switch (operator) {
      case 'not_null':
        isMatch = fieldValue !== null && fieldValue !== undefined && String(fieldValue).trim() !== '' && String(fieldValue).trim() !== 'N/A';
        break;

      case 'is_null':
        isMatch = fieldValue === null || fieldValue === undefined || String(fieldValue).trim() === '' || String(fieldValue).trim() === 'N/A';
        break;

      case 'min':
        if (fieldValue === null || fieldValue === undefined || isNaN(Number(fieldValue))) {
          isMatch = false;
        } else {
          isMatch = Number(fieldValue) >= Number(minValue !== undefined ? minValue : value);
        }
        break;

      case 'max':
        if (fieldValue === null || fieldValue === undefined || isNaN(Number(fieldValue))) {
          isMatch = false;
        } else {
          isMatch = Number(fieldValue) <= Number(maxValue !== undefined ? maxValue : value);
        }
        break;

      case 'range':
        if (fieldValue === null || fieldValue === undefined || isNaN(Number(fieldValue))) {
          isMatch = false;
        } else {
          const num = Number(fieldValue);
          const min = minValue !== undefined ? Number(minValue) : -Infinity;
          const max = maxValue !== undefined ? Number(maxValue) : Infinity;
          isMatch = num >= min && num <= max;
        }
        break;

      case 'regex':
        if (!fieldValue || !pattern) {
          isMatch = false;
        } else {
          try {
            const rx = new RegExp(pattern);
            isMatch = rx.test(String(fieldValue));
          } catch {
            isMatch = false;
          }
        }
        break;

      case 'email_valid':
        if (!fieldValue) {
          isMatch = false;
        } else {
          const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
          const str = String(fieldValue).trim();
          isMatch = emailRegex.test(str) && !str.includes('@@') && !str.includes('..');
        }
        break;

      case 'phone_valid':
        if (!fieldValue) {
          isMatch = false;
        } else {
          const str = String(fieldValue).trim();
          const digits = str.replace(/\D/g, '');
          // Valid phone must have 7 to 15 digits (E.164 standard) and follow allowed formatting characters
          const validFormat = /^(\+?\d{1,4}[-.\s]?)?(\(?\d{1,5}\)?[-.\s]?)?[\d\s.-]{4,14}\d$/;
          isMatch = validFormat.test(str) && digits.length >= 7 && digits.length <= 15 && str !== 'N/A';
        }
        break;

      case 'in_set':
        if (!set || !Array.isArray(set)) {
          isMatch = true;
        } else {
          const lowerSet = set.map(s => String(s).toLowerCase().trim());
          isMatch = lowerSet.includes(String(fieldValue).toLowerCase().trim());
        }
        break;

      case 'not_in_set':
        if (!set || !Array.isArray(set)) {
          isMatch = true;
        } else {
          const lowerSet = set.map(s => String(s).toLowerCase().trim());
          isMatch = !lowerSet.includes(String(fieldValue).toLowerCase().trim());
        }
        break;

      case 'unique':
        if (!fieldValue || allDatasetRecords.length === 0) {
          isMatch = true;
        } else {
          const count = allDatasetRecords.filter(r => {
            const d = r.data || r;
            return String(d[field]).toLowerCase().trim() === String(fieldValue).toLowerCase().trim();
          }).length;
          isMatch = count <= 1;
        }
        break;

      case 'length_between':
        if (fieldValue === null || fieldValue === undefined) {
          isMatch = false;
        } else {
          const len = String(fieldValue).length;
          const min = minValue !== undefined ? Number(minValue) : 0;
          const max = maxValue !== undefined ? Number(maxValue) : Infinity;
          isMatch = len >= min && len <= max;
        }
        break;

      default:
        isMatch = true;
    }

    return negate ? !isMatch : isMatch;
  }

  /**
   * Evaluates a full structured rule (AND/OR of conditions) against a record
   */
  static evaluateRule(structuredRule, recordData, allRecords = []) {
    const conditions = structuredRule.conditions || [];
    if (conditions.length === 0) return { passed: true, failedCondition: null };

    const logic = (structuredRule.logic || 'AND').toUpperCase();

    if (logic === 'OR') {
      for (const cond of conditions) {
        if (this.evaluateCondition(cond, recordData, allRecords)) {
          return { passed: true, failedCondition: null };
        }
      }
      return { passed: false, failedCondition: conditions[0] };
    }

    // Default AND
    for (const cond of conditions) {
      if (!this.evaluateCondition(cond, recordData, allRecords)) {
        return { passed: false, failedCondition: cond };
      }
    }

    return { passed: true, failedCondition: null };
  }

  /**
   * Execute-Before-Trust: Validates candidate rule on real sample data before activation
   */
  static validateCandidateRule(structuredRule, sampleRecords = []) {
    const testedRows = sampleRecords.length;
    if (testedRows === 0) {
      return {
        testedRows: 0,
        passRate: 100,
        passedCount: 0,
        failedCount: 0,
        flaggedAsUnsafe: false,
        safetyReason: '',
        sampleFailures: []
      };
    }

    let passedCount = 0;
    let failedCount = 0;
    const sampleFailures = [];

    sampleRecords.forEach((record, index) => {
      const data = record.data || record;
      const evalResult = this.evaluateRule(structuredRule, data, sampleRecords);

      if (evalResult.passed) {
        passedCount++;
      } else {
        failedCount++;
        if (sampleFailures.length < 5) {
          const field = evalResult.failedCondition?.field || 'unknown';
          sampleFailures.push({
            rowNumber: record.rowNumber || index + 1,
            recordId: record._id ? String(record._id) : `rec_${index + 1}`,
            field,
            actualValue: data[field],
            reason: `Violated condition: ${evalResult.failedCondition?.operator} on field '${field}'`
          });
        }
      }
    });

    const passRate = parseFloat(((passedCount / testedRows) * 100).toFixed(1));

    // Safety checks
    let flaggedAsUnsafe = false;
    let safetyReason = '';

    if (passRate === 0) {
      flaggedAsUnsafe = true;
      safetyReason = 'Execute-Before-Trust Alert: 0% of tested rows passed. Condition may be inverted, overly strict, or targeting the wrong field.';
    } else if (passRate < 20) {
      flaggedAsUnsafe = true;
      safetyReason = `Execute-Before-Trust Warning: Very high failure rate (${(100 - passRate).toFixed(0)}% failed). Review rule constraints before enabling.`;
    }

    return {
      testedRows,
      passRate,
      passedCount,
      failedCount,
      flaggedAsUnsafe,
      safetyReason,
      sampleFailures,
      validatedAt: new Date()
    };
  }

  /**
   * Runs an active rule across all dataset records and outputs issues
   */
  static runRuleOnDataset(rule, records = []) {
    const violations = [];

    records.forEach((record, index) => {
      const data = record.data || record;
      const evalResult = this.evaluateRule(rule.structuredRule, data, records);

      if (!evalResult.passed) {
        const field = evalResult.failedCondition?.field || 'general';
        const rawVal = data[field];
        
        let type = 'violation';
        if (evalResult.failedCondition?.operator === 'not_null') type = 'null_defect';
        else if (evalResult.failedCondition?.operator === 'email_valid' || evalResult.failedCondition?.operator === 'phone_valid') type = 'format_error';
        else if (evalResult.failedCondition?.operator === 'min' || evalResult.failedCondition?.operator === 'max' || evalResult.failedCondition?.operator === 'range') type = 'outlier';

        violations.push({
          datasetId: rule.datasetId,
          ruleId: rule._id,
          recordId: record._id,
          rowNumber: record.rowNumber || index + 1,
          type,
          severity: rule.severity || 'medium',
          field,
          currentValue: rawVal,
          explanation: `Rule '${rule.name}' failed: ${rule.description || evalResult.failedCondition?.operator} (Actual value: "${rawVal ?? 'NULL'}")`,
          status: 'open'
        });
      }
    });

    return violations;
  }

  /**
   * Evaluates how confident the deterministic engine already is about an issue.
   * Return 0..1. If confidence is >= AGENT_CONFIDENCE_THRESHOLD, the issue
   * can be resolved deterministically without invoking the LLM+RAG agent.
   */
  static getConfidence(issue, record) {
    const field = issue.field;
    const rawVal = record?.data?.[field] ?? record?.[field] ?? issue.currentValue;

    // Direct null/empty issues have high deterministic confidence
    if (rawVal === null || rawVal === undefined || String(rawVal).trim() === '') {
      return 0.95;
    }

    // Well-known domain typos (e.g. @@ or ..) have high confidence
    const str = String(rawVal);
    if (str.includes('@@') || str.includes('..') || str.endsWith('@gmai.com')) {
      return 0.92;
    }

    // Complex formatting, missing prefixes, ambiguous tax IDs have lower confidence
    if (issue.type === 'format_error' || issue.type === 'violation' || issue.type === 'outlier') {
      return 0.50;
    }

    return 0.65;
  }

  /**
   * Deterministically validates a proposed patch value before it can reach a steward.
   * Tests the proposed value against the active rule/operator syntax.
   * @returns {{ valid: boolean, error?: string }}
   */
  static validatePatch(issue, record, proposedValue) {
    if (proposedValue === null || proposedValue === undefined || String(proposedValue).trim() === '') {
      return { valid: false, error: 'Proposed value cannot be empty or null' };
    }

    const field = issue.field || '';
    const strVal = String(proposedValue).trim();

    // Validate email format if target is email
    if (field.toLowerCase().includes('email')) {
      const emailCondition = { field, operator: 'email_valid' };
      const ok = this.evaluateCondition(emailCondition, { [field]: strVal });
      if (!ok) return { valid: false, error: `Proposed value "${strVal}" is not a valid RFC email` };
    }

    // Validate phone format if target is phone
    if (field.toLowerCase().includes('phone') || field.toLowerCase().includes('mobile')) {
      const phoneCondition = { field, operator: 'phone_valid' };
      const ok = this.evaluateCondition(phoneCondition, { [field]: strVal });
      if (!ok) return { valid: false, error: `Proposed value "${strVal}" does not satisfy telecomm phone standards` };
    }

    // Validate tax ID format if target is taxId/gstin/pan
    if (field.toLowerCase().includes('tax') || field.toLowerCase().includes('gst')) {
      const gstinCondition = {
        field,
        operator: 'regex',
        pattern: '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$',
      };
      // Allow general enterprise formats or Indian GSTIN
      if (strVal.length === 15 && !this.evaluateCondition(gstinCondition, { [field]: strVal })) {
        return { valid: false, error: `Proposed value "${strVal}" violates 15-char GSTIN checksum/format` };
      }
    }

    return { valid: true };
  }
}
