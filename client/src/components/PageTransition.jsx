/**
 * @module PageTransition
 * @description Framer Motion wrapper that applies a consistent fade-in +
 * upward slide animation to every page transition, giving the application
 * a polished SPA feel without bespoke per-page animation code.
 *
 * Usage:
 *   <PageTransition>
 *     <DashboardPage />
 *   </PageTransition>
 */
import React from 'react';
import { motion } from 'framer-motion';
import PropTypes from 'prop-types';

/** Shared animation variants — re-export for custom usage if needed. */
export const PAGE_VARIANTS = {
  hidden:  { opacity: 0, y: 16 },
  visible: {
    opacity:    1,
    y:          0,
    transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] },
  },
  exit: {
    opacity:    0,
    y:          -8,
    transition: { duration: 0.2 },
  },
};

/**
 * @param {{ children: React.ReactNode }} props
 */
export const PageTransition = ({ children }) => (
  <motion.div
    variants={PAGE_VARIANTS}
    initial="hidden"
    animate="visible"
    exit="exit"
    className="w-full"
  >
    {children}
  </motion.div>
);

PageTransition.propTypes = {
  children: PropTypes.node.isRequired,
};
