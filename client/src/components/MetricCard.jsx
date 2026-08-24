/**
 * @module MetricCard
 * @description Animated KPI card used on Dashboard and Eval pages.
 * Shows a title, primary metric value, optional trend indicator, and
 * a bottom sub-label line.
 *
 * Framer Motion entrance: fade-in from bottom with configurable delay.
 */
import React from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { clsx } from 'clsx';

/**
 * @param {{
 *   title:      string;
 *   value:      string | number;
 *   sub?:       string;
 *   icon?:      React.ElementType;
 *   iconColor?: string;
 *   trend?:     'up' | 'down' | 'flat';
 *   trendLabel?: string;
 *   delay?:     number;
 *   accent?:    'emerald' | 'cyan' | 'indigo' | 'rose' | 'amber';
 * }} props
 */
export const MetricCard = ({
  title,
  value,
  sub,
  icon: Icon,
  iconColor  = 'text-brand-400',
  trend,
  trendLabel,
  delay      = 0,
  accent     = 'emerald',
}) => {
  const accentBorder = {
    emerald: 'hover:border-brand-500/40 hover:shadow-glow-emerald',
    cyan:    'hover:border-brand-cyan/40 hover:shadow-glow-cyan',
    indigo:  'hover:border-brand-indigo/40 hover:shadow-glow-indigo',
    rose:    'hover:border-brand-rose/40 hover:shadow-glow-rose',
    amber:   'hover:border-amber-500/40',
  };

  const TrendIcon =
    trend === 'up'   ? TrendingUp   :
    trend === 'down' ? TrendingDown :
    Minus;

  const trendColor =
    trend === 'up'   ? 'text-emerald-400' :
    trend === 'down' ? 'text-rose-400'    :
    'text-slate-500';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0  }}
      transition={{ duration: 0.4, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className={clsx(
        'glass-panel p-5 rounded-2xl border border-slate-800 transition-all duration-300 relative overflow-hidden',
        accentBorder[accent],
      )}
    >
      {/* Background glow orb */}
      <div className="absolute -top-8 -right-8 w-28 h-28 bg-brand-500/5 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            {title}
          </span>
          {Icon && (
            <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center bg-slate-800/80', iconColor)}>
              <Icon className="w-3.5 h-3.5" />
            </div>
          )}
        </div>

        <p className="text-2xl font-extrabold text-white tracking-tight leading-none">
          {value}
        </p>

        {(trendLabel || sub) && (
          <div className="flex items-center justify-between">
            {sub && <span className="text-[11px] text-slate-500">{sub}</span>}
            {trend && trendLabel && (
              <span className={clsx('flex items-center space-x-1 text-[10px] font-bold', trendColor)}>
                <TrendIcon className="w-3 h-3" />
                <span>{trendLabel}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

MetricCard.propTypes = {
  title:      PropTypes.string.isRequired,
  value:      PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  sub:        PropTypes.string,
  icon:       PropTypes.elementType,
  iconColor:  PropTypes.string,
  trend:      PropTypes.oneOf(['up', 'down', 'flat']),
  trendLabel: PropTypes.string,
  delay:      PropTypes.number,
  accent:     PropTypes.oneOf(['emerald', 'cyan', 'indigo', 'rose', 'amber']),
};
