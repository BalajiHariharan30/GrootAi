import { store }               from '../data/inMemoryStore.js';
import { getDBStatus }          from '../config/db.js';
import { Dataset }              from '../models/Dataset.js';
import { Rule }                 from '../models/Rule.js';
import { Issue }                from '../models/Issue.js';
import { Record }               from '../models/Record.js';
import { RuleEngineService }    from '../services/ruleEngine.service.js';
import { MatcherService }       from '../services/matcher.service.js';
import { RemediationService }   from '../services/remediation.service.js';
import { ragStore }             from '../ai/ragStore.js';

export const mcpToolDefinitions = [
  {
    name: 'run_dq_check',
    description: 'Run a specific data quality rule against a dataset and return violations',
    input_schema: {
      type: 'object',
      properties: {
        datasetId: { type: 'string' },
        ruleId:    { type: 'string' },
      },
      required: ['datasetId', 'ruleId'],
    },
  },
  {
    name: 'explain_match',
    description: 'Return a field-level explanation and confidence score for why two records were flagged as duplicates',
    input_schema: {
      type: 'object',
      properties: {
        recordIdA: { type: 'string' },
        recordIdB: { type: 'string' },
      },
      required: ['recordIdA', 'recordIdB'],
    },
  },
  {
    name: 'propose_fix',
    description: 'Given a flagged issue, propose a remediation action for human review. Never applies a fix directly.',
    input_schema: {
      type: 'object',
      properties: { issueId: { type: 'string' } },
      required: ['issueId'],
    },
  },
  {
    name: 'get_dataset_profile',
    description: 'Retrieve comprehensive profiling statistics, column metadata, and health scores for a dataset',
    input_schema: {
      type: 'object',
      properties: { datasetId: { type: 'string' } },
      required: ['datasetId'],
    },
  },
  {
    name: 'search_knowledge_base',
    description: 'Semantic vector search across enterprise data specifications and past steward remediation decisions (RAG)',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Semantic search text e.g. email format or taxId' },
        field: { type: 'string', description: 'Optional field filter e.g. phone or email' },
        category: { type: 'string', enum: ['schema_spec', 'decision_memory'] },
        topK: { type: 'number', default: 3 }
      },
      required: ['query']
    }
  }
];

// Helper: resolve a document from MongoDB or in-memory store
async function resolveDoc(mongoFn, storeFn) {
  return getDBStatus() ? await mongoFn() : storeFn();
}

export async function handleMCPToolCall(toolName, args) {
  const db = getDBStatus();

  switch (toolName) {
    case 'run_dq_check': {
      const { datasetId, ruleId } = args;
      const rule    = await resolveDoc(
        () => Rule.findById(ruleId).lean(),
        () => store.rules.find(r => String(r._id) === String(ruleId)),
      );
      if (!rule) throw new Error(`Rule ${ruleId} not found`);

      const records = await resolveDoc(
        () => Record.find({ datasetId }).lean(),
        () => store.records.filter(r => String(r.datasetId) === String(datasetId)),
      );
      const violations = RuleEngineService.runRuleOnDataset(rule, records);
      return { ruleName: rule.name, testedRows: records.length, violationsCount: violations.length, violations: violations.slice(0, 10) };
    }

    case 'explain_match': {
      const { recordIdA, recordIdB } = args;
      const [recA, recB] = await Promise.all([
        resolveDoc(() => Record.findById(recordIdA).lean(), () => store.records.find(r => String(r._id) === String(recordIdA))),
        resolveDoc(() => Record.findById(recordIdB).lean(), () => store.records.find(r => String(r._id) === String(recordIdB))),
      ]);
      if (!recA || !recB) throw new Error('One or both records not found');
      return MatcherService.explainMatch(recA, recB);
    }

    case 'propose_fix': {
      const { issueId } = args;
      const issue = await resolveDoc(
        () => Issue.findById(issueId).lean(),
        () => store.issues.find(i => String(i._id) === String(issueId)),
      );
      if (!issue) throw new Error(`Issue ${issueId} not found`);
      const record = await resolveDoc(
        () => Record.findById(issue.recordId).lean(),
        () => store.records.find(r => String(r._id) === String(issue.recordId)),
      );
      return await RemediationService.proposeFix(issue, record);
    }

    case 'get_dataset_profile': {
      const { datasetId } = args;
      const dataset = await resolveDoc(
        () => Dataset.findById(datasetId).lean(),
        () => store.datasets.find(d => String(d._id) === String(datasetId)),
      );
      if (!dataset) throw new Error(`Dataset ${datasetId} not found`);
      return {
        datasetId:    dataset._id,
        name:         dataset.name,
        rowCount:     dataset.rowCount,
        qualityScore: dataset.qualityScore,
        dimensions:   dataset.dimensions,
        columns:      dataset.profile?.columns,
      };
    }

    case 'search_knowledge_base': {
      const { query, field, category, topK = 3 } = args;
      const filter = field ? { field } : {};
      const hits = await ragStore.search(query, { filter, category, topK });
      return {
        query,
        count: hits.length,
        results: hits.map((h) => ({
          id: h.id,
          category: h.category,
          score: parseFloat(h.score.toFixed(3)),
          text: h.text,
          metadata: h.metadata,
        })),
      };
    }

    default:
      throw new Error(`Unknown MCP Tool: ${toolName}`);
  }
}
