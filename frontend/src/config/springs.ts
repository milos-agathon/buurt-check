/**
 * Named spring animation configs for Framer Motion.
 * All Framer Motion transitions in this app MUST use these constants.
 */

export const SPRING_EXPAND = {
  type: 'spring' as const,
  stiffness: 350,
  damping: 28,
};

export const SPRING_REVEAL = {
  type: 'spring' as const,
  stiffness: 200,
  damping: 22,
};

export const SPRING_TAB = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
};
