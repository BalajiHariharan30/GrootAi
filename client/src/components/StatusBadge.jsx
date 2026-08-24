/**
 * @module StatusBadge
 * @description Reusable animated status badge component used throughout
 * the application for issue severity, rule status, remediation state, etc.
 *
 * Supports pulse animation for active/live states, and optional dot indicator.
 */
import React from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { clsx } from 'clsx';

/** @type {Record<string, string>} */
const VARIANT_CLASSES = {
  critical: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  high:     'bg-amber-500/10 text-amber-400 border-amber-500/20',
  medium:   'bg-cyan-500/10   text-cyan-400  border-cyan-500/20',
  low:      'bg-slate-500/10  text-slate-400 border-slate-500/20',
  active:   'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  pending:  'bg-amber-500/10  text-amber-300  border-amber-500/20',
  rejected: 'bg-rose-500/10  text-rose-400   border-rose-500/20',
  applied:  'bg-brand-500/10 text-brand-400  border-brand-500/20',
  info:     'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  neutral:  'bg-slate-800    text-slate-300   border-slate-700',
};

/** @type {Record<string, string>} */
const DOT_CLASSES = {
  critical: 'bg-rose-400',
  high:     'bg-amber-400',
  medium:   'bg-cyan-400',
  low:      'bg-slate-400',
  active:   'bg-emerald-400',
  pending:  'bg-amber-400',
  rejected: 'bg-rose-400',
  applied:  'bg-brand-400',
  info:     'bg-indigo-400',
  neutral:  'bg-slate-400',
};

/**
 * @param {{
 *   label:   string;
 *   variant: keyof VARIANT_CLASSES;
 *   dot?:    boolean;
 *   pulse?:  boolean;
 *   size?:   'sm' | 'md';
 *   className?: string;
 * }} props
 */
export const StatusBadge = ({
  label,
  variant = 'neutral',
  dot     = false,
  pulse   = false,
  size    = 'sm',
  className,
}) => {
  const variantClass = VARIANT_CLASSES[variant] ?? VARIANT_CLASSES.neutral;
  const dotClass     = DOT_CLASSES[variant]     ?? DOT_CLASSES.neutral;
  const sizeClass    = size === 'md' ? 'text-xs px-2.5 py-0.5' : 'text-[10px] px-2 py-0.5';

  return (
    <motion.span
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1,   opacity: 1 }}
      className={clsx(
        'inline-flex items-center space-x-1.5 rounded font-bold uppercase tracking-wider border',
        sizeClass,
        variantClass,
        className,
      )}
    >
      {dot && (
        <span
          className={clsx(
            'w-1.5 h-1.5 rounded-full shrink-0',
            dotClass,
            pulse && 'animate-pulse',
          )}
        />
      )}
      <span>{label}</span>
    </motion.span>
  );
};

StatusBadge.propTypes = {
  label:     PropTypes.string.isRequired,
  variant:   PropTypes.oneOf(Object.keys(VARIANT_CLASSES)),
  dot:       PropTypes.bool,
  pulse:     PropTypes.bool,
  size:      PropTypes.oneOf(['sm', 'md']),
  className: PropTypes.string,
};
