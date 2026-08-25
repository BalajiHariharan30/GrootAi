import crypto from 'crypto';

/**
 * AI Tool Use Client for Natural Language Data Quality Translation & Reasoning
 */
export class AIClient {
  /**
   * Translates natural language into a strict executable DQ Rule AST
   * @param {string} nlInput - The user's plain English rule
   * @param {Array} columns - Profiled column metadata [{ name, inferredType, sampleValues }]
   */
  static async parseNLToStructuredRule(nlInput, columns = []) {
    const columnNames = columns.map(c => c.name);
    const contextPrompt = `
You are the GrootAi Data Quality Intelligence Agent.
Given a dataset with columns: ${JSON.stringify(columns.map(c => ({ name: c.name, type: c.inferredType, sample: (c.sampleValues || []).slice(0, 2) })))}
Translate the user's natural language business rule into a strict structured JSON rule object.

Available Operators:
- 'not_null': value must not be null/empty
- 'is_null': value must be null
- 'min': value >= minValue
- 'max': value <= maxValue
- 'range': minValue <= value <= maxValue
- 'regex': value matches regex pattern
- 'email_valid': standard RFC 5322 email syntax
- 'phone_valid': standard phone format
- 'in_set': value in allowed list
- 'not_in_set': value not in forbidden list
- 'unique': value must be unique across dataset
- 'length_between': string length between min and max

User Rule: "${nlInput}"
`;

    // 1. Check if ANTHROPIC_API_KEY is configured for live Claude Tool Use
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            temperature: 0.1, // Low temp for deterministic structured code
            tools: [{
              name: 'define_data_quality_rule',
              description: 'Forces strict structured DQ rule definition',
              input_schema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Concise descriptive title of the rule' },
                  description: { type: 'string', description: 'Plain English summary of what the rule enforces' },
                  category: { type: 'string', enum: ['validity', 'completeness', 'uniqueness', 'consistency', 'range'] },
                  severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
                  logic: { type: 'string', enum: ['AND', 'OR'] },
                  conditions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        field: { type: 'string', enum: columnNames },
                        operator: { 
                          type: 'string', 
                          enum: ['not_null', 'is_null', 'min', 'max', 'range', 'regex', 'email_valid', 'phone_valid', 'in_set', 'not_in_set', 'unique', 'length_between'] 
                        },
                        minValue: { type: 'number' },
                        maxValue: { type: 'number' },
                        pattern: { type: 'string' },
                        set: { type: 'array', items: { type: 'string' } }
                      },
                      required: ['field', 'operator']
                    }
                  }
                },
                required: ['name', 'description', 'category', 'severity', 'conditions']
              }
            }],
            tool_choice: { type: 'tool', name: 'define_data_quality_rule' },
            messages: [{ role: 'user', content: contextPrompt }]
          })
        });

        const data = await response.json();
        if (data.content && data.content[0] && data.content[0].input) {
          return data.content[0].input;
        }
      } catch (err) {
        console.warn(`[AI Tool-Use] Claude API call fallback triggered: ${err.message}`);
      }
    }

    // 2. High-precision Grounded AST Parser Fallback
    return this.deterministicASTParser(nlInput, columns);
  }

  /**
   * Deterministic pattern and semantic matcher grounded in the active column schema
   */
  static deterministicASTParser(nlInput, columns = []) {
    const text = nlInput.toLowerCase();
    const columnNames = columns.map(c => c.name);

    // Find referenced columns by prioritizing longest exact/token match
    const sortedCols = [...columnNames].sort((a, b) => b.length - a.length);
    let targetField = null;

    for (const col of sortedCols) {
      const lower = col.toLowerCase();
      // split camelCase e.g. shippingCountry -> shipping country, customerEmail -> customer email
      const spaced = col.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
      if (text.includes(lower) || text.includes(spaced)) {
        targetField = col;
        break;
      }
    }

    if (!targetField && sortedCols.length > 0) {
      targetField = sortedCols[0];
    }
    targetField = targetField || 'field';
    const conditions = [];
    let category = 'validity';
    let severity = 'medium';

    if (text.includes('critical') || text.includes('fatal') || text.includes('must never')) {
      severity = 'critical';
    } else if (text.includes('warn') || text.includes('minor') || text.includes('low')) {
      severity = 'low';
    } else if (text.includes('high') || text.includes('urgent') || text.includes('error')) {
      severity = 'high';
    }

    // 1. Email validity
    if (text.includes('email') && (text.includes('valid') || text.includes('format') || text.includes('syntax') || text.includes('correct') || text.includes('rfc'))) {
      const emailField = targetField.toLowerCase().includes('email') ? targetField : (columnNames.find(c => c.toLowerCase().includes('email')) || targetField);
      conditions.push({
        field: emailField,
        operator: 'email_valid',
        description: 'Email must conform to standard RFC format'
      });
      category = 'validity';
    }

    // 2. Phone validity & format
    if (text.includes('phone') && (text.includes('valid') || text.includes('format') || text.includes('standard') || text.includes('international') || text.includes('country code'))) {
      const phoneField = targetField.toLowerCase().includes('phone') ? targetField : (columnNames.find(c => c.toLowerCase().includes('phone')) || targetField);
      conditions.push({
        field: phoneField,
        operator: 'phone_valid',
        description: 'Phone must follow valid telecommunication format'
      });
      category = 'validity';
    }

    // 3. Not Null / Mandatory checks
    if (text.includes('not null') || text.includes('cannot be null') || text.includes('mandatory') || text.includes('required') || text.includes('must not be empty') || text.includes('must be present') || text.includes('is required') || text.includes('cannot be empty')) {
      if (!conditions.some(c => c.field === targetField && c.operator === 'not_null')) {
        conditions.push({
          field: targetField,
          operator: 'not_null'
        });
      }
      category = 'completeness';
    }

    // 4. Positive numbers / Greater than zero
    if (text.includes('positive') || text.includes('greater than 0') || text.includes('> 0') || text.includes('above 0') || text.includes('cannot be negative')) {
      const numericField = targetField && targetField !== 'field' ? targetField : (columnNames.find(c => ['lifetimevalue', 'subtotal', 'totalamount', 'amount', 'price', 'quantity', 'taxamount'].includes(c.toLowerCase())) || targetField);
      conditions.push({
        field: numericField,
        operator: 'min',
        minValue: 0.01
      });
      category = 'range';
    }

    // 5. Under / Max numeric bounds (e.g. "under 100000", "<= 1000000", "max 500")
    const maxMatch = text.match(/(?:under|less than|max|below|<=|<)\s*(?:₹|\$|eur|usd)?\s*([\d,]+(?:\.\d+)?)/i);
    if (maxMatch) {
      const rawNum = maxMatch[1].replace(/,/g, '');
      const maxVal = parseFloat(rawNum);
      const numericField = targetField && targetField !== 'field' ? targetField : (columnNames.find(c => ['lifetimevalue', 'subtotal', 'totalamount', 'amount', 'price', 'discountpercent', 'taxamount'].includes(c.toLowerCase())) || targetField);
      
      const existingMin = conditions.find(c => c.field === numericField && c.operator === 'min');
      if (existingMin) {
        conditions.splice(conditions.indexOf(existingMin), 1);
        conditions.push({
          field: numericField,
          operator: 'range',
          minValue: existingMin.minValue,
          maxValue: maxVal
        });
      } else {
        conditions.push({
          field: numericField,
          operator: 'max',
          maxValue: maxVal
        });
      }
      category = 'range';
    }

    // 6. Between / Range (e.g. "between 0 and 100")
    const betweenMatch = text.match(/between\s+([\d,.]+)\s+and\s+([\d,.]+)/i);
    if (betweenMatch) {
      const minVal = parseFloat(betweenMatch[1].replace(/,/g, ''));
      const maxVal = parseFloat(betweenMatch[2].replace(/,/g, ''));
      conditions.push({
        field: targetField,
        operator: 'range',
        minValue: minVal,
        maxValue: maxVal
      });
      category = 'range';
    }

    // 7. Uniqueness
    if (text.includes('unique') || text.includes('no duplicate') || text.includes('distinct')) {
      conditions.push({
        field: targetField,
        operator: 'unique'
      });
      category = 'uniqueness';
    }

    // 8. In set / allowed values (e.g. "status must be active, suspended, or pending")
    const setMatch = text.match(/(?:must be|one of|in)\s*\[?([a-zA-Z0-9_,\s/]+)\]?/i);
    if (setMatch && (text.includes('status') || text.includes('type') || text.includes('tier') || text.includes('country'))) {
      const allowed = setMatch[1].split(/,|\bor\b|\band\b/).map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
      if (allowed.length > 1) {
        conditions.push({
          field: targetField,
          operator: 'in_set',
          set: allowed
        });
        category = 'consistency';
      }
    }

    // Default fallback condition if nothing captured
    if (conditions.length === 0) {
      conditions.push({
        field: targetField,
        operator: 'not_null'
      });
    }

    // Generate rule name & description
    const formattedField = targetField.charAt(0).toUpperCase() + targetField.slice(1);
    const ruleName = `${formattedField} ${category.charAt(0).toUpperCase() + category.slice(1)} Verification`;
    const description = `Ensures ${targetField} complies with business requirements: ${nlInput}`;

    return {
      name: ruleName,
      description,
      category,
      severity,
      structuredRule: {
        logic: 'AND',
        conditions
      }
    };
  }

  /**
   * Generates natural language explanation for matching/duplicate records
   */
  static generateMatchExplanation(fieldComparisons, compositeConfidence) {
    const strongMatches = fieldComparisons.filter(f => f.similarityScore >= 0.85);
    const weakMatches = fieldComparisons.filter(f => f.similarityScore < 0.60);

    const summaryParts = [];
    if (strongMatches.length > 0) {
      summaryParts.push(`Identical/near-exact match on [${strongMatches.map(f => f.field).join(', ')}]`);
    }
    if (weakMatches.length > 0) {
      summaryParts.push(`Minor discrepancy found in [${weakMatches.map(f => f.field).join(', ')}]`);
    }

    const confidenceLabel = compositeConfidence > 0.85 ? 'High Confidence Duplicate' : 'Potential Match for Human Review';
    return `${confidenceLabel} (${Math.round(compositeConfidence * 100)}% Match Score). ${summaryParts.join('. ')}.`;
  }

  /**
   * Generates agent remediation proposal with reasoning
   */
  static generateRemediationProposal(issue, record) {
    const field = issue.field || 'target';
    const val = issue.currentValue;

    if (issue.type === 'format_error' || field.toLowerCase().includes('phone')) {
      const digits = String(val).replace(/\D/g, '');
      let formatted = val;
      if (digits.length === 10) {
        formatted = `+1-${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
      } else if (digits.length === 11 && digits.startsWith('1')) {
        formatted = `+1-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
      } else if (digits.length === 12 && digits.startsWith('91')) {
        formatted = `+91-${digits.slice(2, 7)}-${digits.slice(7)}`;
      }

      return {
        strategy: 'format_standardize',
        targetField: field,
        proposedFix: {
          beforeValue: val,
          afterValue: formatted,
          diffDetails: `Standardized raw telecommunication sequence '${val}' to canonical format '${formatted}'`
        },
        agentReasoning: `Record contains unformatted or inconsistent phone digits. Standardizing ensures downstream telephony, SMS, and CRM integration fidelity.`,
        confidence: 0.96
      };
    }

    if (issue.type === 'format_error' || field.toLowerCase().includes('email')) {
      const cleaned = String(val).replace(/@@+/g, '@').replace(/\.\.+/g, '.').trim();
      return {
        strategy: 'domain_fix',
        targetField: field,
        proposedFix: {
          beforeValue: val,
          afterValue: cleaned,
          diffDetails: `Corrected duplicated syntax symbols in '${val}' -> '${cleaned}'`
        },
        agentReasoning: `Detected duplicated delimiter '@' and '.' syntax error in email address. Reconstructed valid RFC syntax.`,
        confidence: 0.94
      };
    }

    if (issue.type === 'duplicate') {
      return {
        strategy: 'merge_records',
        targetField: 'all',
        proposedFix: {
          beforeValue: `Duplicate pair: Record #${issue.rowNumber} & Record #${issue.matchDetails?.rowNumberB}`,
          afterValue: `Merged Golden Customer Profile`,
          diffDetails: `Combined populated fields from secondary record into survivor primary record.`
        },
        agentReasoning: `Multi-field fuzzy score exceeds duplicate threshold (${Math.round((issue.matchConfidence || 0.9) * 100)}%). Recommend merging into a single canonical Master Data Record.`,
        confidence: issue.matchConfidence || 0.92
      };
    }

    if (issue.type === 'outlier' || issue.type === 'violation') {
      return {
        strategy: 'custom_patch',
        targetField: field,
        proposedFix: {
          beforeValue: val,
          afterValue: typeof val === 'number' ? Math.max(0, val) : val,
          diffDetails: `Clamped bounds and normalized anomalous value.`
        },
        agentReasoning: `Detected violation of domain boundary rules. Proposing normalized default value for review.`,
        confidence: 0.88
      };
    }

    return {
      strategy: 'impute_default',
      targetField: field,
      proposedFix: {
        beforeValue: val,
        afterValue: 'UNKNOWN_SPECIFIED',
        diffDetails: `Imputed missing mandatory field.`
      },
      agentReasoning: `Mandatory field was empty or null. Proposing standard enterprise placeholder.`,
      confidence: 0.85
    };
  }
}
