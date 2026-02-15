import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SPRING_SHEET } from '../config/springs';
import './DossierSheet.css';

export type SheetSnap = 'hidden' | 'peek' | 'half' | 'full';

interface DossierSheetProps {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  children: React.ReactNode;
}

const SNAP_HEIGHTS: Record<SheetSnap, string> = {
  hidden: '0px',
  peek: '140px',
  half: '50vh',
  full: '90vh',
};

// Velocity threshold for fast-swipe detection (px/s)
const VELOCITY_THRESHOLD = 500;
// Distance threshold for slow-drag snap change (px)
const DRAG_THRESHOLD = 100;

export default function DossierSheet({ snap, onSnapChange, children }: DossierSheetProps) {
  // Escape key at full -> half
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && snap === 'full') {
        onSnapChange('half');
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [snap, onSnapChange]);

  // Gesture handler: velocity-first, then distance fallback
  const handleDragEnd = useCallback(
    (_: unknown, info: { velocity: { y: number }; offset: { y: number } }) => {
      const vy = info.velocity.y;
      const dy = info.offset.y;

      // Fast swipe up -> expand one level (or go full)
      if (vy < -VELOCITY_THRESHOLD) {
        onSnapChange(snap === 'peek' ? 'half' : 'full');
        return;
      }
      // Fast swipe down -> collapse one level (or go peek)
      if (vy > VELOCITY_THRESHOLD) {
        onSnapChange(snap === 'full' ? 'half' : 'peek');
        return;
      }

      // Slow drag: snap based on drag distance
      if (dy < -DRAG_THRESHOLD) {
        onSnapChange(snap === 'peek' ? 'half' : 'full');
      } else if (dy > DRAG_THRESHOLD) {
        onSnapChange(snap === 'full' ? 'half' : 'peek');
      }
      // If drag < threshold, spring back to current snap (no-op)
    },
    [snap, onSnapChange],
  );

  if (snap === 'hidden') {
    return <div data-testid="dossier-sheet" style={{ display: 'none' }} />;
  }

  return (
    <>
      <AnimatePresence>
        {snap === 'full' && (
          <motion.div
            className="dossier-sheet__backdrop"
            data-testid="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => onSnapChange('half')}
          />
        )}
      </AnimatePresence>
      <motion.div
        data-testid="dossier-sheet"
        className="dossier-sheet"
        animate={{ height: SNAP_HEIGHTS[snap] }}
        transition={SPRING_SHEET}
      >
        {/* Drag is on the HANDLE only — content div scrolls normally */}
        <motion.div
          className="dossier-sheet__handle"
          data-testid="sheet-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag to resize"
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={0.1}
          onDragEnd={handleDragEnd}
        >
          <div className="dossier-sheet__pill" />
        </motion.div>
        <div className={`dossier-sheet__content${snap === 'peek' ? ' dossier-sheet__content--peek' : ''}`}>
          {children}
        </div>
      </motion.div>
    </>
  );
}
