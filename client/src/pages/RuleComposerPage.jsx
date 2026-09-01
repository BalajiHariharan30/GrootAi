/**
 * @module RuleComposerPage
 * @description The GrootAi Natural Language Rule Studio.
 *
 * Key engineering decisions:
 *  • Input is validated client-side (min 10 chars) before dispatch
 *  • `AgentThinkingPulse` renders during AI parse to signal async work
 *  • `AnimatePresence` from Framer Motion drives enter/exit of candidate card
 *  • `react-hot-toast` provides non-blocking operation feedback
 *  • Memoised `suggestedPrompts` chips to prevent re-render churn
 *  • `StatusBadge` shared component replaces ad-hoc badge markup
 */
import React, { useState, useEffect, useCallback, memo } from 'react';
import { useSelector, useDispatch }                       from 'react-redux';
import { motion, AnimatePresence }                        from 'framer-motion';
import toast                                              from 'react-hot-toast';
import PropTypes                                          from 'prop-types';
import {
  Sparkles, Cpu, Send, ShieldCheck, Code2,
} from 'lucide-react';

import {
  parseNLRule,
  saveAndActivateRule,
  fetchRulesForDataset,
  clearCandidateRule,
}                                from '../store/ruleSlice.js';
import { RuleTestPreview }       from '../components/RuleTestPreview.jsx';
import { AgentThinkingPulse }    from '../components/AgentThinkingPulse.jsx';
import { StatusBadge }           from '../components/StatusBadge.jsx';
import { PageTransition }        from '../components/PageTransition.jsx';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MIN_INPUT_LENGTH = 10;

const SUGGESTED_PROMPTS = Object.freeze([
  'email must be valid and cannot be empty',
  'phone number must match +91 Indian standard',
  'taxId must be valid 15-character GSTIN format',
  'lifetimeValue must be positive and under ₹50,00,000',
  'postalCode must be a valid 6-digit Indian PIN code',
  'customerId must be unique across all records',
  'state must be one of Maharashtra, Karnataka, Tamil Nadu, Delhi, Gujarat, Telangana',
  'accountStatus must be one of active, suspended, or pending_verification',
]);


// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Memoised suggestion chip to prevent re-render on parent state changes */
const SuggestionChip = memo(({ prompt, onClick }) => (
  <motion.button
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    type="button"
    onClick={() => onClick(prompt)}
    className="px-2.5 py-1 text-[11px] bg-slate-900/80 hover:bg-slate-800 text-slate-300
               hover:text-white rounded-lg border border-slate-800 hover:border-slate-700
               transition-colors text-left truncate max-w-xs"
  >
    "{prompt}"
  </motion.button>
));

SuggestionChip.displayName = 'SuggestionChip';
SuggestionChip.propTypes   = {
  prompt:  PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
};

/** Memoised active rule card */
const ActiveRuleCard = memo(({ rule }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0  }}
    className="glass-panel p-4 rounded-xl border border-slate-800 space-y-2"
  >
    <div className="flex items-center justify-between">
      <span className="font-bold text-sm text-white">{rule.name}</span>
      <StatusBadge
        label={rule.status}
        variant={rule.status === 'active' ? 'active' : 'pending'}
      />
    </div>
    <p className="text-xs text-slate-400">{rule.description || rule.naturalLanguageInput}</p>
    <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
      <span className="capitalize">Category: {rule.category}</span>
      <span className="capitalize font-mono">Severity: {rule.severity}</span>
    </div>
  </motion.div>
));

ActiveRuleCard.displayName = 'ActiveRuleCard';
ActiveRuleCard.propTypes   = {
  rule: PropTypes.shape({
    _id:                 PropTypes.string,
    name:                PropTypes.string.isRequired,
    status:              PropTypes.string,
    description:         PropTypes.string,
    naturalLanguageInput:PropTypes.string,
    category:            PropTypes.string,
    severity:            PropTypes.string,
  }).isRequired,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const RuleComposerPage = () => {
  const dispatch = useDispatch();

  const { selectedDatasetId, list: datasets } = useSelector((s) => s.datasets);
  const { candidateRule, rulesList, parsing, activating, parseError } =
    useSelector((s) => s.rules);

  const [inputPrompt, setInputPrompt] = useState('');

  const activeDataset = datasets.find((d) => d._id === selectedDatasetId) ?? datasets[0];

  // Fetch rules whenever the active dataset changes (or when first dataset loads)
  useEffect(() => {
    const dsId = selectedDatasetId ?? datasets[0]?._id;
    if (dsId) dispatch(fetchRulesForDataset(dsId));
  }, [selectedDatasetId, datasets, dispatch]);

  // Surface AI parse errors as toast notifications
  useEffect(() => {
    if (parseError) toast.error(`Rule parsing failed: ${parseError}`);
  }, [parseError]);

  /** Dispatches the NL parse action after basic client-side validation. */
  const handleParse = useCallback(
    (e) => {
      e?.preventDefault();
      const trimmed = inputPrompt.trim();

      if (trimmed.length < MIN_INPUT_LENGTH) {
        toast.error(`Please describe your rule in at least ${MIN_INPUT_LENGTH} characters.`);
        return;
      }
      if (!selectedDatasetId) {
        toast.error('Select a dataset before parsing a rule.');
        return;
      }

      dispatch(parseNLRule({ naturalLanguageInput: trimmed, datasetId: selectedDatasetId }));
    },
    [inputPrompt, selectedDatasetId, dispatch],
  );

  /** Saves and activates the currently staged candidate rule. */
  const handleActivate = useCallback(() => {
    if (!candidateRule || !selectedDatasetId) return;

    const promise = dispatch(
      saveAndActivateRule({ ...candidateRule, datasetId: selectedDatasetId }),
    ).unwrap();

    toast.promise(promise, {
      loading: 'Activating rule and scanning dataset…',
      success: (res) => `Rule activated — ${res?.violationsCount ?? 0} violation(s) found.`,
      error:   'Activation failed. Please try again.',
    });
  }, [candidateRule, selectedDatasetId, dispatch]);

  const handleDiscard = useCallback(() => {
    dispatch(clearCandidateRule());
    toast('Candidate rule discarded.', { icon: '🗑️' });
  }, [dispatch]);

  const handleSuggestionClick = useCallback((prompt) => {
    setInputPrompt(prompt);
  }, []);

  // ---------------------------------------------------------------------------
  return (
    <PageTransition>
      <div className="space-y-8 pb-12">
        {/* ── Page Header ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Natural Language Rule Studio
            </h1>
            <StatusBadge label="Agentic Tool Use" variant="info" dot pulse />
            {/* AI mode pill — shows which engine is active */}
            {candidateRule?.aiMode === 'claude' ? (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-500/20 text-violet-300 border border-violet-500/30">
                ✦ Claude 3.5 Sonnet
              </span>
            ) : candidateRule?.aiMode === 'ast_parser' ? (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-700 text-slate-300 border border-slate-600">
                ⚙ Grounded AST Engine
              </span>
            ) : null}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Express business data quality rules in plain English. Constrained AI
            tool-calling compiles them into deterministic ASTs with
            Execute-Before-Trust sample validation.
          </p>
        </motion.div>

        {/* ── Prompt Composer Box ──────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.35 }}
          className="glass-panel p-6 rounded-2xl border border-slate-700/80 shadow-2xl relative overflow-hidden"
        >
          {/* Ambient glow */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-brand-indigo/10 rounded-full blur-3xl pointer-events-none" />

          <form onSubmit={handleParse} className="space-y-4 relative z-10">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-brand-400 animate-pulse" />
                <span>Describe Data Quality Rule</span>
              </label>
              <span className="text-[11px] text-slate-400">
                Grounded in{' '}
                <span className="text-white font-bold">
                  {activeDataset?.name ?? 'dataset'}
                </span>{' '}
                columns
              </span>
            </div>

            <textarea
              rows={3}
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              placeholder='e.g. "email must be valid, lifetimeValue must be positive and under 1,000,000, country cannot be null"'
              className="w-full bg-slate-950/90 border border-slate-700 rounded-xl p-4 text-sm text-slate-100
                         placeholder-slate-500 focus:outline-none focus:border-brand-indigo focus:ring-1
                         focus:ring-brand-indigo transition-all font-medium resize-none"
            />

            {/* Suggestion chips */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Suggested Enterprise Prompts:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <SuggestionChip
                    key={prompt}
                    prompt={prompt}
                    onClick={handleSuggestionClick}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                type="submit"
                disabled={parsing || inputPrompt.trim().length < MIN_INPUT_LENGTH}
                className="px-6 py-2.5 rounded-xl text-xs font-bold
                           bg-gradient-to-r from-brand-indigo via-brand-cyan to-brand-500
                           text-white shadow-glow-indigo transition-all
                           disabled:opacity-50 disabled:cursor-not-allowed
                           flex items-center space-x-2"
              >
                {parsing ? (
                  <>
                    <Cpu className="w-4 h-4 animate-spin" />
                    <span>Compiling AST…</span>
                  </>
                ) : (
                  <>
                    <span>Compile Structured Rule</span>
                    <Send className="w-3.5 h-3.5" />
                  </>
                )}
              </motion.button>
            </div>
          </form>
        </motion.div>

        {/* ── Agent Thinking Pulse ─────────────────────────────────────── */}
        <AnimatePresence>
          {parsing && (
            <motion.div key="thinking" exit={{ opacity: 0 }}>
              <AgentThinkingPulse message="GrootAi Agent is compiling and validating your rule…" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Execute-Before-Trust Candidate Preview ───────────────────── */}
        <AnimatePresence>
          {candidateRule && !parsing && (
            <motion.div
              key="candidate"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0  }}
              exit={{ opacity: 0, y: -10  }}
              transition={{ duration: 0.35 }}
            >
              <RuleTestPreview
                candidateRule={candidateRule}
                onActivate={handleActivate}
                onDiscard={handleDiscard}
                isActivating={activating}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Active Rules List ────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-brand-500" />
              <span>Active Operational Rules</span>
              {rulesList.length > 0 && (
                <span className="text-brand-400">({rulesList.length})</span>
              )}
            </h2>
            <div className="flex items-center space-x-2">
              {activeDataset && (
                <span className="text-[10px] font-bold text-slate-500 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
                  📂 {activeDataset.name}
                </span>
              )}
              <span className="text-xs text-slate-500">Continuously enforced</span>
            </div>
          </div>

          {rulesList.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-panel p-8 rounded-2xl border border-slate-800 text-center space-y-3"
            >
              <Code2 className="w-10 h-10 mx-auto text-slate-600 mb-2" />
              <p className="text-sm font-bold text-slate-300">No Active Rules Yet</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                {activeDataset
                  ? `No rules defined for "${activeDataset.name}". Type a business rule above (e.g. "email must be valid") and click Compile, then Confirm & Activate.`
                  : 'Select a dataset from the Catalog, then type a rule in plain English above to get started.'}
              </p>
              <div className="text-[11px] text-slate-600 mt-1">
                💡 Try a suggested prompt chip above to create your first rule instantly.
              </div>
            </motion.div>
          ) : (

            <motion.div
              layout
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              {rulesList.map((rule) => (
                <ActiveRuleCard key={rule._id} rule={rule} />
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </PageTransition>
  );
};
