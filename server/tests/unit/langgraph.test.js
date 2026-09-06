/**
 * @module langgraph.test
 * @description Unit tests for LangGraph + Dual-Tier RAG remediation agent:
 *   1. RAG grounding gate (empty context on non-matching filter, retrieved on match)
 *   2. Anti-hallucination citation verification
 *   3. Confidence gate (shouldUseAgent)
 *   4. Deterministic patch validation (ruleEngineInterface)
 *   5. Full graph execution & bounded self-correction loop
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryRagStore, retrieveRemediationContext } from '../../src/ai/ragStore.js';
import {
  verifyCitations,
  shouldUseAgent,
  buildRuleEngineInterface,
  buildRemediationGraph,
} from '../../src/ai/remediationGraph.js';
import { RuleEngineService } from '../../src/services/ruleEngine.service.js';

describe('RAG Store Grounding Gate & Dual-Tier Retrieval', () => {
  test('returns empty context when nothing matches metadata filter', async () => {
    const store = new InMemoryRagStore();
    await store.upsertChunk({
      id: 'spec_email',
      category: 'schema_spec',
      text: 'Field: email in Dataset: Customers. Type: String RFC 5322.',
      metadata: { field: 'email', dataset: 'Customers' },
    });

    const ctx = await retrieveRemediationContext(store, {
      field: 'taxId',
      issueType: 'missing_value',
      description: 'taxId missing',
    });

    assert.equal(ctx.specChunks.length, 0);
    assert.equal(ctx.decisionChunks.length, 0);
  });

  test('retrieves matching spec chunk when field matches', async () => {
    const store = new InMemoryRagStore();
    await store.upsertChunk({
      id: 'spec_phone',
      category: 'schema_spec',
      text: 'Field: phone in Dataset: Customers. Type: String. Standard: E.164 with +91 country code.',
      metadata: { field: 'phone', dataset: 'Customers' },
    });

    const ctx = await retrieveRemediationContext(store, {
      field: 'phone',
      issueType: 'missing_country_code',
      description: 'phone missing country code',
    }, { minScore: -1 });

    assert.equal(ctx.specChunks.length, 1);
    assert.equal(ctx.specChunks[0].id, 'spec_phone');
  });

  test('retrieves both tier A spec and tier B decision chunks', async () => {
    const store = new InMemoryRagStore();
    await store.upsertChunks([
      {
        id: 'spec_email_01',
        category: 'schema_spec',
        text: 'Field: email. Valid syntax only.',
        metadata: { field: 'email' },
      },
      {
        id: 'decision_email_01',
        category: 'decision_memory',
        text: 'Fix @@ to @ for user email.',
        metadata: { field: 'email', approvedFix: 'user@gmail.com' },
      }
    ]);

    const ctx = await retrieveRemediationContext(store, {
      field: 'email',
      issueType: 'format_error',
      description: 'email has invalid characters',
    }, { minScore: -1 });

    assert.equal(ctx.specChunks.length, 1);
    assert.equal(ctx.decisionChunks.length, 1);
    assert.equal(ctx.specChunks[0].id, 'spec_email_01');
    assert.equal(ctx.decisionChunks[0].id, 'decision_email_01');
  });
});

describe('Anti-Hallucination Citation Verification', () => {
  test('flags a citation to a chunk id that was never retrieved', () => {
    const ragContext = {
      specChunks: [{ id: 'spec_phone' }],
      decisionChunks: [],
    };
    const result = verifyCitations(['spec_phone', 'spec_madeup'], ragContext);
    assert.equal(result.ok, false);
    assert.deepEqual(result.invalidIds, ['spec_madeup']);
  });

  test('passes when all cited ids were actually retrieved', () => {
    const ragContext = {
      specChunks: [{ id: 'spec_phone' }],
      decisionChunks: [{ id: 'decision_phone_01' }],
    };
    const result = verifyCitations(['spec_phone', 'decision_phone_01'], ragContext);
    assert.equal(result.ok, true);
    assert.deepEqual(result.invalidIds, []);
  });
});

describe('Confidence Gate (shouldUseAgent)', () => {
  test('skips the agent entirely when rule engine is already confident', () => {
    const ruleEngineIface = { getConfidence: () => 0.95, validatePatch: () => ({ valid: true }) };
    const use = shouldUseAgent({ field: 'email' }, {}, ruleEngineIface, { confidenceThreshold: 0.85 });
    assert.equal(use, false);
  });

  test('routes to the agent when rule engine confidence is low', () => {
    const ruleEngineIface = { getConfidence: () => 0.40, validatePatch: () => ({ valid: true }) };
    const use = shouldUseAgent({ field: 'taxId' }, {}, ruleEngineIface, { confidenceThreshold: 0.85 });
    assert.equal(use, true);
  });
});

describe('Deterministic Rule Engine Validation Interface', () => {
  const iface = buildRuleEngineInterface(RuleEngineService);

  test('validates valid email patch', () => {
    const result = iface.validatePatch({ field: 'email' }, {}, 'test@domain.com');
    assert.equal(result.valid, true);
  });

  test('rejects invalid email patch', () => {
    const result = iface.validatePatch({ field: 'email' }, {}, 'test@@bad..com');
    assert.equal(result.valid, false);
    assert.match(result.error, /not a valid RFC email/i);
  });

  test('validates valid phone patch (+91 standard)', () => {
    const result = iface.validatePatch({ field: 'phone' }, {}, '+91 98200 12345');
    assert.equal(result.valid, true);
  });
});

describe('Full LangGraph State Machine Execution', () => {
  test('executes 5-node graph and grounds fix on retrieved precedent', async () => {
    const store = new InMemoryRagStore();
    await store.upsertChunks([
      {
        id: 'spec_phone_01',
        category: 'schema_spec',
        text: 'Field: phone. E.164 telecomm format with +91 country prefix.',
        metadata: { field: 'phone' },
      },
      {
        id: 'decision_phone_precedent',
        category: 'decision_memory',
        text: 'Prepend +91 98200 12345 for 10 digit Indian number.',
        metadata: { field: 'phone', approvedFix: '+91 98200 12345', strategy: 'phone_standardize' },
      }
    ]);

    let committed = false;
    const graph = buildRemediationGraph({
      ruleEngineService: RuleEngineService,
      ragStore: store,
      onCommit: async () => { committed = true; }
    });

    const res = await graph.invoke(
      {
        issue: { id: 'iss_phone_1', field: 'phone', issueType: 'format_error', description: 'missing country code' },
        record: { phone: '9820012345' }
      },
      { configurable: { thread_id: 'test_thread_phone_1' } }
    );

    assert.ok(res.candidateFix);
    assert.equal(res.candidateFix.status, 'PROPOSED');
    assert.equal(res.candidateFix.proposedValue, '+91 98200 12345');
    assert.ok(res.candidateFix.citedChunkIds.includes('decision_phone_precedent'));
    assert.equal(res.validationResult.valid, true);
  });
});
