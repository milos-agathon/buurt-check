import type { CSSProperties } from 'react';
import './DossierSheet.css';

export type SheetSnap = 'hidden' | 'peek' | 'half' | 'full';

interface DossierSheetProps {
  snap: SheetSnap;
  children: React.ReactNode;
}

export default function DossierSheet({ snap, children }: DossierSheetProps) {
  if (snap === 'hidden') {
    return <div data-testid="dossier-sheet" style={{ display: 'none' }} />;
  }

  const contentStyle: CSSProperties = {
    '--dossier-action-bar-offset': 'var(--action-bar-height, 64px)',
  } as CSSProperties;

  return (
    <section data-testid="dossier-sheet" className="dossier-sheet">
      <div id="dossier-content" className="dossier-sheet__content" style={contentStyle}>
        {children}
      </div>
    </section>
  );
}
