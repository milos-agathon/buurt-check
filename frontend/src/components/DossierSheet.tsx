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

  return (
    <section data-testid="dossier-sheet" className="dossier-sheet">
      <div id="dossier-content" className="dossier-sheet__content">
        {children}
      </div>
    </section>
  );
}
