import natural from 'natural';

const { JaroWinklerDistance, LevenshteinDistance } = natural;

export class MatcherService {
  /**
   * Computes string similarity score between 0.0 and 1.0
   */
  static computeStringSimilarity(strA, strB) {
    if (strA === strB) return 1.0;
    if (!strA || !strB) return 0.0;

    const sA = String(strA).toLowerCase().trim();
    const sB = String(strB).toLowerCase().trim();

    if (sA === sB) return 1.0;

    // Check if one contains the other (e.g. "Alex Hamilton" inside "Alexander Hamilton")
    if (sA.includes(sB) || sB.includes(sA)) {
      const lengthRatio = Math.min(sA.length, sB.length) / Math.max(sA.length, sB.length);
      return Math.max(0.85, parseFloat(lengthRatio.toFixed(2)));
    }

    const jaroScore = JaroWinklerDistance(sA, sB);
    const maxLen = Math.max(sA.length, sB.length);
    const levScore = 1 - (LevenshteinDistance(sA, sB) / maxLen);

    // Weighted average of Jaro-Winkler (favors prefix matches) & Levenshtein
    const composite = (jaroScore * 0.65) + (levScore * 0.35);
    return Math.max(0, Math.min(1.0, parseFloat(composite.toFixed(2))));
  }

  /**
   * Compares two telecommunication strings (handling prefixes, formatting, country codes)
   */
  static comparePhone(phoneA, phoneB) {
    if (!phoneA || !phoneB) return { score: 0.0, explanation: 'Missing phone value in one or both records' };
    
    const digitsA = String(phoneA).replace(/\D/g, '');
    const digitsB = String(phoneB).replace(/\D/g, '');

    if (digitsA === digitsB && digitsA.length >= 7) {
      return { 
        score: 1.0, 
        matchType: 'exact',
        explanation: `Exact digit match (${digitsA}). Discrepancy is purely typographical formatting.` 
      };
    }

    if (digitsA.endsWith(digitsB) || digitsB.endsWith(digitsA)) {
      return {
        score: 0.95,
        matchType: 'fuzzy_high',
        explanation: `Matching subscriber number with differing country/area code prefixes (${digitsA} vs ${digitsB}).`
      };
    }

    const sim = this.computeStringSimilarity(digitsA, digitsB);
    return {
      score: sim,
      matchType: sim > 0.8 ? 'fuzzy_high' : 'mismatch',
      explanation: sim > 0.8 ? `Near-identical digits (differ by 1-2 digits)` : `Different phone numbers (${phoneA} vs ${phoneB})`
    };
  }

  /**
   * Performs deep field-by-field explainable match between two records
   */
  static explainMatch(recordA, recordB) {
    const dataA = recordA.data || recordA;
    const dataB = recordB.data || recordB;

    const commonKeys = Array.from(new Set([...Object.keys(dataA), ...Object.keys(dataB)]))
      .filter(k => !['_id', 'createdAt', 'updatedAt', 'rowNumber', 'hasIssues', 'issueCount', 'version', '__v'].includes(k));

    const fieldBreakdown = [];
    let weightedScoreSum = 0;
    let totalWeight = 0;

    for (const key of commonKeys) {
      const valA = dataA[key];
      const valB = dataB[key];
      const lowerKey = key.toLowerCase();

      let fieldScore = 0.0;
      let fieldMatchType = 'mismatch';
      let fieldExplanation = '';
      let weight = 1.0;

      // Assign importance weights
      if (lowerKey.includes('taxid') || lowerKey.includes('ssn') || lowerKey.includes('id')) {
        weight = 3.0;
      } else if (lowerKey.includes('email') || lowerKey.includes('phone')) {
        weight = 2.5;
      } else if (lowerKey.includes('name')) {
        weight = 2.0;
      } else if (lowerKey.includes('company') || lowerKey.includes('address') || lowerKey.includes('city')) {
        weight = 1.5;
      } else {
        weight = 0.8;
      }

      if (valA === undefined || valA === null || valB === undefined || valB === null) {
        fieldScore = 0.0;
        fieldMatchType = 'mismatch';
        fieldExplanation = `One record has null/missing ${key}`;
      } else if (lowerKey.includes('phone')) {
        const phoneRes = this.comparePhone(valA, valB);
        fieldScore = phoneRes.score;
        fieldMatchType = phoneRes.matchType;
        fieldExplanation = phoneRes.explanation;
      } else if (typeof valA === 'number' || typeof valB === 'number') {
        const numA = Number(valA);
        const numB = Number(valB);
        if (numA === numB) {
          fieldScore = 1.0;
          fieldMatchType = 'exact';
          fieldExplanation = `Exact numeric match (${numA})`;
        } else {
          const diffRatio = Math.abs(numA - numB) / Math.max(Math.abs(numA), Math.abs(numB), 1);
          fieldScore = Math.max(0, parseFloat((1 - diffRatio).toFixed(2)));
          fieldMatchType = fieldScore > 0.8 ? 'fuzzy_high' : 'mismatch';
          fieldExplanation = `Numeric difference: ${valA} vs ${valB} (${(diffRatio * 100).toFixed(1)}% variance)`;
        }
      } else {
        const strA = String(valA).trim();
        const strB = String(valB).trim();
        fieldScore = this.computeStringSimilarity(strA, strB);

        if (fieldScore === 1.0) {
          fieldMatchType = 'exact';
          fieldExplanation = `Exact match: "${strA}"`;
        } else if (fieldScore >= 0.85) {
          fieldMatchType = 'fuzzy_high';
          fieldExplanation = `High fuzzy match (${Math.round(fieldScore * 100)}%): "${strA}" vs "${strB}"`;
        } else if (fieldScore >= 0.65) {
          fieldMatchType = 'fuzzy_medium';
          fieldExplanation = `Partial similarity (${Math.round(fieldScore * 100)}%): "${strA}" vs "${strB}"`;
        } else {
          fieldMatchType = 'mismatch';
          fieldExplanation = `Mismatch: "${strA}" vs "${strB}"`;
        }
      }

      fieldBreakdown.push({
        field: key,
        valueA: valA,
        valueB: valB,
        similarityScore: fieldScore,
        matchType: fieldMatchType,
        explanation: fieldExplanation
      });

      weightedScoreSum += (fieldScore * weight);
      totalWeight += weight;
    }

    const compositeScore = totalWeight > 0 ? parseFloat((weightedScoreSum / totalWeight).toFixed(2)) : 0.0;

    return {
      compositeScore,
      fieldBreakdown,
      recordA,
      recordB,
      isDuplicate: compositeScore >= 0.80,
      confidenceLevel: compositeScore >= 0.88 ? 'HIGH' : compositeScore >= 0.70 ? 'MEDIUM_REVIEW' : 'LOW'
    };
  }

  /**
   * Scans an entire dataset for duplicate record pairs
   */
  static scanDatasetForDuplicates(datasetId, records = []) {
    const duplicateIssues = [];
    const n = records.length;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const rA = records[i];
        const rB = records[j];

        const match = this.explainMatch(rA, rB);

        if (match.compositeScore >= 0.75) {
          const explanation = `Potential duplicate pair detected between Record #${rA.rowNumber || i + 1} and Record #${rB.rowNumber || j + 1} (${Math.round(match.compositeScore * 100)}% confidence).`;

          duplicateIssues.push({
            datasetId,
            recordId: rA._id,
            rowNumber: rA.rowNumber || i + 1,
            type: 'duplicate',
            severity: match.compositeScore >= 0.88 ? 'high' : 'medium',
            field: 'composite_profile',
            currentValue: `Pair: #${rA.rowNumber || i + 1} & #${rB.rowNumber || j + 1}`,
            explanation,
            matchConfidence: match.compositeScore,
            matchDetails: {
              recordIdB: rB._id,
              rowNumberB: rB.rowNumber || j + 1,
              compositeScore: match.compositeScore,
              fieldBreakdown: match.fieldBreakdown,
              matchedRecordData: rB.data || rB,
              recommendedSurvivor: 'merge'
            },
            status: 'open'
          });
        }
      }
    }

    return duplicateIssues;
  }
}
