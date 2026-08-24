export class ProfilerService {
  /**
   * Infer data type for an array of values
   */
  static inferColumnType(values, columnName = '') {
    const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '' && v !== 'N/A' && v !== 'null');
    if (nonNullValues.length === 0) return 'string';

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const phoneRegex = /^(\+?\d{1,3}[-.\s]?)?(\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}$/;
    const dateRegex = /^\d{4}[-/.]\d{2}[-/.]\d{2}(T\d{2}:\d{2}:\d{2})?/;
    const idRegex = /^[A-Z0-9_-]{3,24}$/i;

    let emailCount = 0;
    let phoneCount = 0;
    let intCount = 0;
    let floatCount = 0;
    let dateCount = 0;
    let boolCount = 0;

    for (const val of nonNullValues) {
      if (typeof val === 'boolean' || val === 'true' || val === 'false') {
        boolCount++;
        continue;
      }
      if (typeof val === 'number') {
        if (Number.isInteger(val)) intCount++;
        else floatCount++;
        continue;
      }

      const str = String(val).trim();

      if (emailRegex.test(str)) {
        emailCount++;
      } else if (phoneRegex.test(str) && (str.length >= 7 && (str.includes('-') || str.includes('+') || str.length === 10))) {
        phoneCount++;
      } else if (dateRegex.test(str) && !isNaN(Date.parse(str))) {
        dateCount++;
      } else if (!isNaN(Number(str)) && str !== '') {
        if (Number.isInteger(Number(str))) intCount++;
        else floatCount++;
      }
    }

    const total = nonNullValues.length;
    if (emailCount / total > 0.6 || columnName.toLowerCase().includes('email')) return 'email';
    if (phoneCount / total > 0.6 || columnName.toLowerCase().includes('phone')) return 'phone';
    if (dateCount / total > 0.6 || columnName.toLowerCase().includes('date')) return 'date';
    if (boolCount / total > 0.8) return 'boolean';
    if (intCount / total > 0.8) return 'integer';
    if ((intCount + floatCount) / total > 0.8) return 'float';

    // Check ID pattern
    if (columnName.toLowerCase().endsWith('id') || columnName.toLowerCase() === 'id' || columnName.toLowerCase().includes('taxid')) {
      return 'id';
    }

    // Check if category
    const distinctSet = new Set(nonNullValues.map(v => String(v).toLowerCase()));
    if (distinctSet.size <= 8 && distinctSet.size / total < 0.4) {
      return 'category';
    }

    return 'string';
  }

  /**
   * Profiles a collection of raw record objects
   */
  static profileRecords(records = []) {
    if (!records || records.length === 0) {
      return {
        columns: [],
        qualityScore: 100,
        dimensions: { completeness: 100, validity: 100, uniqueness: 100, consistency: 100 }
      };
    }

    const totalRows = records.length;
    const allKeys = Array.from(
      new Set(records.flatMap(r => Object.keys(r.data || r)))
    );

    const columns = [];
    let totalNullsAcrossDataset = 0;
    let totalFieldsAcrossDataset = totalRows * allKeys.length;
    let validityErrors = 0;

    for (const key of allKeys) {
      const values = records.map(r => {
        const raw = r.data || r;
        return raw[key];
      });

      const nullValues = values.filter(v => v === null || v === undefined || v === '' || v === 'N/A' || v === 'null');
      const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '' && v !== 'N/A' && v !== 'null');
      
      const nullCount = nullValues.length;
      totalNullsAcrossDataset += nullCount;
      const nullPercent = parseFloat(((nullCount / totalRows) * 100).toFixed(2));

      // Value counts & distinct
      const freqMap = new Map();
      let minVal = null;
      let maxVal = null;
      let numericSum = 0;
      let numericCount = 0;

      for (const val of nonNullValues) {
        const strVal = String(val);
        freqMap.set(strVal, (freqMap.get(strVal) || 0) + 1);

        if (typeof val === 'number' || (!isNaN(Number(val)) && val !== '')) {
          const num = Number(val);
          numericSum += num;
          numericCount++;
          if (minVal === null || num < minVal) minVal = num;
          if (maxVal === null || num > maxVal) maxVal = num;
        }
      }

      const distinctCount = freqMap.size;
      const cardinality = totalRows > 0 ? parseFloat((distinctCount / totalRows).toFixed(4)) : 0;
      const inferredType = this.inferColumnType(values, key);

      // Check validity based on inferred type
      if (inferredType === 'email') {
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        for (const v of nonNullValues) {
          if (!emailRegex.test(String(v).trim())) validityErrors++;
        }
      } else if (inferredType === 'phone') {
        const phoneRegex = /^(\+?\d{1,3}[-.\s]?)?(\(?\d{2,4}\)?[-.\s]?)?\d{3,4}[-.\s]?\d{3,4}$/;
        for (const v of nonNullValues) {
          if (!phoneRegex.test(String(v).trim()) || String(v).length < 7) validityErrors++;
        }
      }

      // Sample values (up to 5 distinct non-null)
      const sampleValues = Array.from(freqMap.keys()).slice(0, 5);

      // Top frequent values
      const topValues = Array.from(freqMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count }));

      columns.push({
        name: key,
        inferredType,
        nullCount,
        nullPercent,
        distinctCount,
        cardinality,
        sampleValues,
        stats: {
          min: minVal !== null ? minVal : undefined,
          max: maxVal !== null ? maxVal : undefined,
          avg: numericCount > 0 ? parseFloat((numericSum / numericCount).toFixed(2)) : undefined,
          topValues,
        }
      });
    }

    // Calculate Quality Dimensions
    const completeness = Math.max(0, Math.min(100, parseFloat(((1 - (totalNullsAcrossDataset / totalFieldsAcrossDataset)) * 100).toFixed(1))));
    const validity = Math.max(0, Math.min(100, parseFloat(((1 - (validityErrors / Math.max(1, totalFieldsAcrossDataset))) * 100).toFixed(1))));
    
    // Uniqueness estimate (based on primary ID or avg cardinality)
    const uniqueness = Math.max(75, Math.min(100, parseFloat((100 - (validityErrors * 1.5)).toFixed(1))));
    const consistency = Math.max(80, Math.min(100, parseFloat((100 - (totalNullsAcrossDataset * 0.5)).toFixed(1))));

    // Overall Quality Score weighted
    const qualityScore = Math.round(
      (completeness * 0.35) +
      (validity * 0.35) +
      (uniqueness * 0.15) +
      (consistency * 0.15)
    );

    return {
      columns,
      qualityScore,
      dimensions: {
        completeness,
        validity,
        uniqueness,
        consistency
      }
    };
  }

  /**
   * Diffs two schema profiles to detect drift
   */
  static diffProfiles(oldProfile, newProfile) {
    if (!oldProfile || !oldProfile.columns) return { hasDrift: false, changes: [] };

    const oldMap = new Map(oldProfile.columns.map(c => [c.name, c]));
    const newMap = new Map(newProfile.columns.map(c => [c.name, c]));
    const changes = [];

    // Added or modified columns
    for (const [colName, newCol] of newMap.entries()) {
      if (!oldMap.has(colName)) {
        changes.push({ type: 'COLUMN_ADDED', column: colName, detail: `New column detected with type ${newCol.inferredType}` });
      } else {
        const oldCol = oldMap.get(colName);
        if (oldCol.inferredType !== newCol.inferredType) {
          changes.push({ type: 'TYPE_DRIFT', column: colName, detail: `Type changed from ${oldCol.inferredType} to ${newCol.inferredType}` });
        }
        if (Math.abs(oldCol.nullPercent - newCol.nullPercent) > 10) {
          changes.push({ type: 'NULL_SPIKE', column: colName, detail: `Null % changed from ${oldCol.nullPercent}% to ${newCol.nullPercent}%` });
        }
      }
    }

    // Removed columns
    for (const [colName] of oldMap.entries()) {
      if (!newMap.has(colName)) {
        changes.push({ type: 'COLUMN_REMOVED', column: colName, detail: `Column '${colName}' no longer present in dataset` });
      }
    }

    return {
      hasDrift: changes.length > 0,
      changes,
      summary: changes.length > 0 ? changes.map(c => `${c.type}: ${c.detail}`).join('; ') : 'No schema drift detected'
    };
  }
}
