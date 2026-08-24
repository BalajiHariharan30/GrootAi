/**
 * @module AgentThinkingPulse
 * @description Animated "CLAIRE is thinking" indicator displayed while the
 * AI tool-use call is in flight.  Uses Framer Motion staggered dot pulses
 * and a shimmer text effect so users understand the latency is intentional.
 */
import React from 'react';
import { motion } from 'framer-motion';
import { Cpu } from 'lucide-react';
import PropTypes from 'prop-types';

/** Stagger config for the three animated dots */
const DOT_VARIANTS = {
  hidden:  { opacity: 0.2, scaleY: 0.6 },
  visible: (i) => ({
    opacity:    1,
    scaleY:     1.2,
    transition: {
      delay:    i * 0.15,
      duration: 0.5,
      repeat:   Infinity,
      repeatType: 'reverse',
      ease:     'easeInOut',
    },
  }),
};

/**
 * @param {{ message?: string }} props
 */
export const AgentThinkingPulse = ({ message = 'CLAIRE is compiling your rule…' }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    transition={{ duration: 0.25 }}
    className="flex flex-col items-center justify-center py-10 space-y-5"
  >
    {/* Icon with orbit ring */}
    <div className="relative flex items-center justify-center w-16 h-16">
      <div className="absolute inset-0 rounded-full bg-brand-indigo/10 border border-brand-indigo/20 animate-ping" />
      <div className="w-12 h-12 rounded-xl bg-brand-indigo/20 border border-brand-indigo/30 flex items-center justify-center">
        <Cpu className="w-6 h-6 text-brand-indigo animate-spin" style={{ animationDuration: '2s' }} />
      </div>
    </div>

    {/* Staggered dots */}
    <div className="flex items-end space-x-1.5 h-6">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-2 h-4 rounded-full bg-brand-indigo/60"
          variants={DOT_VARIANTS}
          initial="hidden"
          animate="visible"
          custom={i}
        />
      ))}
    </div>

    {/* Shimmer message */}
    <p className="text-xs font-semibold text-slate-400 tracking-wide shimmer-badge px-4 py-1 rounded-full">
      {message}
    </p>
  </motion.div>
);

AgentThinkingPulse.propTypes = {
  message: PropTypes.string,
};
