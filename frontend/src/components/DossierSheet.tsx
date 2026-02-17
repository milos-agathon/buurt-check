import './DossierSheet.css';

export type SheetSnap = 'hidden' | 'peek' | 'half' | 'full';

interface DossierSheetProps {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  children: React.ReactNode;
}

export default function DossierSheet({ snap, children }: DossierSheetProps) {
  if (snap === 'hidden') {
    return <div data-testid="dossier-sheet" style={{ display: 'none' }} />;
  }

  return (
    <section data-testid="dossier-sheet" className="dossier-sheet">
      <div className="dossier-sheet__handle" aria-hidden="true">
        <div className="dossier-sheet__handle-pill" />
      </div>
      <div id="dossier-content" className="dossier-sheet__content">
        {children}
      </div>
    </section>
  );
}
