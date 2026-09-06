/**
 * @module ragSeeder
 * @description Automatically populates RAG dual-tier memory on server start:
 *   Tier A: schema_spec chunks for enterprise customer & orders datasets
 *   Tier B: decision_memory chunks from past approved steward remediations
 */

import { ragStore } from './ragStore.js';
import logger from '../config/logger.js';

export const INITIAL_SCHEMA_SPECS = [
  {
    id: "spec_cust_email",
    category: "schema_spec",
    text: "Field: email | Dataset: Customers. Standard: RFC 5322 compliant syntax. Must contain single @ and valid TLD. Cannot contain consecutive dots or @ symbols.",
    metadata: { field: "email", dataset: "Customers", ruleType: "email_valid" }
  },
  {
    id: "spec_cust_phone",
    category: "schema_spec",
    text: "Field: phone | Dataset: Customers. Standard: E.164 international format. Indian standard prefix is +91 followed by 10-digit mobile number.",
    metadata: { field: "phone", dataset: "Customers", ruleType: "phone_valid" }
  },
  {
    id: "spec_cust_taxId",
    category: "schema_spec",
    text: "Field: taxId | Dataset: Customers. Standard: 15-character Indian GSTIN format (^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$) or valid US Tax ID (TX-XXXXX-US). Mandatory for enterprise entities.",
    metadata: { field: "taxId", dataset: "Customers", ruleType: "regex" }
  },
  {
    id: "spec_cust_ltv",
    category: "schema_spec",
    text: "Field: lifetimeValue | Dataset: Customers. Standard: Positive numeric currency value. Cannot be negative.",
    metadata: { field: "lifetimeValue", dataset: "Customers", ruleType: "min" }
  },
  {
    id: "spec_order_total",
    category: "schema_spec",
    text: "Field: totalAmount | Dataset: Orders. Standard: Positive float between 0.01 and 100,000. Sum of subtotal and taxes minus discounts.",
    metadata: { field: "totalAmount", dataset: "Orders", ruleType: "range" }
  },
  {
    id: "spec_order_postal",
    category: "schema_spec",
    text: "Field: postalCode | Dataset: Orders. Standard: Valid 6-digit Indian PIN code (^[1-9][0-9]{5}$) or 5-digit US ZIP code.",
    metadata: { field: "postalCode", dataset: "Orders", ruleType: "regex" }
  }
];

export const INITIAL_DECISION_PREVIEWS = [
  {
    id: "decision_email_gmai_typo",
    category: "decision_memory",
    text: "Issue: format_error on field 'email' with value '@gmai.com'. Strategy: domain_fix. Approved Fix: '@gmail.com'. Reason: Standard corporate email provider domain correction.",
    metadata: { field: "email", issueType: "format_error", strategy: "domain_fix", approvedFix: "@gmail.com", outcome: "approved" }
  },
  {
    id: "decision_email_double_at",
    category: "decision_memory",
    text: "Issue: format_error on field 'email' with value '@@'. Strategy: format_standardize. Approved Fix: '@'. Reason: Removed accidental double at-sign character.",
    metadata: { field: "email", issueType: "format_error", strategy: "format_standardize", approvedFix: "@", outcome: "approved" }
  },
  {
    id: "decision_phone_indian_prefix",
    category: "decision_memory",
    text: "Issue: format_error on field 'phone' with raw value '9820012345'. Strategy: phone_standardize. Approved Fix: '+91 98200 12345'. Reason: Prepend Indian E.164 country code for 10-digit mobile.",
    metadata: { field: "phone", issueType: "format_error", strategy: "phone_standardize", approvedFix: "+91 98200 12345", outcome: "approved" }
  }
];

export async function seedRagStore(store = ragStore) {
  try {
    const allChunks = [...INITIAL_SCHEMA_SPECS, ...INITIAL_DECISION_PREVIEWS];
    await store.upsertChunks(allChunks);
    logger.info({ event: 'rag_store_seeded', chunkCount: store.size() });
    return store.size();
  } catch (err) {
    logger.warn({ event: 'rag_seeding_failed', error: err.message });
    return 0;
  }
}
