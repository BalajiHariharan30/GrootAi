/**
 * @module ExportService
 * @description Client-side CSV and JSON export utility for records, issues,
 * and audit log data. No server round-trip required — pure browser Blob API.
 *
 * Usage:
 *   ExportService.downloadCSV(records, columns, 'my-dataset');
 *   ExportService.downloadJSON(issues, 'open-issues');
 */

export class ExportService {
  /**
   * Convert an array of objects to a CSV string.
   * Automatically infers headers from the first object's keys.
   */
  static toCSV(rows, columns = []) {
    if (!rows || rows.length === 0) return '';

    // Flatten record.data if present (dataset records)
    const flatRows = rows.map((r) => r.data ?? r);

    const headers =
      columns.length > 0
        ? columns.map((c) => c.name ?? c)
        : Object.keys(flatRows[0]);

    const escape = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      // Wrap in quotes if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headerLine = headers.map(escape).join(',');
    const dataLines = flatRows.map((row) =>
      headers.map((h) => escape(row[h])).join(',')
    );

    return [headerLine, ...dataLines].join('\n');
  }

  /**
   * Trigger a browser download of a CSV file.
   *
   * @param {Array}   rows      - Array of plain objects or record documents
   * @param {Array}   columns   - Optional column name list (preserves order)
   * @param {string}  filename  - Base filename without extension
   */
  static downloadCSV(rows, columns = [], filename = 'export') {
    const csv = this.toCSV(rows, columns);
    this._triggerDownload(csv, `${filename}.csv`, 'text/csv;charset=utf-8;');
  }

  /**
   * Trigger a browser download of a JSON file.
   *
   * @param {any}     data      - Data to serialize
   * @param {string}  filename  - Base filename without extension
   */
  static downloadJSON(data, filename = 'export') {
    const json = JSON.stringify(data, null, 2);
    this._triggerDownload(
      json,
      `${filename}.json`,
      'application/json;charset=utf-8;'
    );
  }

  /**
   * Convert an audit log array to a human-readable CSV report.
   */
  static downloadAuditCSV(auditItems, filename = 'audit-log') {
    const rows = auditItems.map((item) => ({
      Timestamp:    new Date(item.appliedAt ?? item.createdAt).toLocaleString(),
      ApprovedBy:   item.approvedBy ?? 'System',
      Row:          `Row #${item.rowNumber}`,
      Field:        item.targetField,
      Strategy:     item.strategy,
      Status:       item.status,
      BeforeValue:  item.proposedFix?.beforeValue ?? '',
      AfterValue:   item.proposedFix?.afterValue ?? '',
      Confidence:   item.confidence != null ? `${Math.round(item.confidence * 100)}%` : '',
      AgentReason:  item.agentReasoning ?? '',
    }));
    this.downloadCSV(rows, [], filename);
  }

  /**
   * Convert issues list to CSV report.
   */
  static downloadIssuesCSV(issues, filename = 'issues-report') {
    const rows = issues.map((iss) => ({
      IssueID:     String(iss._id ?? ''),
      Type:        iss.type,
      Severity:    iss.severity,
      Row:         `Row #${iss.rowNumber}`,
      Field:       iss.field,
      CurrentVal:  iss.currentValue,
      Explanation: iss.explanation,
      Status:      iss.status,
      DetectedAt:  new Date(iss.createdAt).toLocaleString(),
    }));
    this.downloadCSV(rows, [], filename);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  static _triggerDownload(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
