# Viewer Premium Content Cleanup — Design

**Date:** 2026-03-02
**Branch:** feat/dossier-diagnostic-gaps
**Source:** tasks/orders acceptance criteria

## Goal

Remove premium-only content from the frontend viewer while keeping it in the Full Dossier PDF. Consolidate purchase and export CTAs.

## Orders Summary

| # | Order | Status |
|---|-------|--------|
| 1 | Premium-only content hidden from viewer | To implement |
| 2 | Single "Buy Full Dossier" CTA in ExportBottomSheet only | To implement |
| 3 | Single viewing checklist CTA with "FREE" label | Already done (i18n keys already include FREE/GRATIS, no duplicate CTA in Next Steps) |
| 4 | Remove redundant risk cards block | Already done |
| 5 | Neighborhood Snapshot text wrapping | Already handled (CSS) |

## Order 1: Premium-only content visibility

Items to remove from viewer (keep in PDF):
- **Property Warnings** (foundation risk, erfpacht, VvE, lead pipe): Remove entire section 4 from App.tsx
- **Asbestos Awareness**: Already hidden (`showAsbestos={false}`, `includeAsbestos={false}`)
- **Soil Contamination Check**: Already absent from App.tsx
- **Shadow Snapshots**: Already PDF-only (captured by 3D viewer, not displayed)
- **Direct sun (clear-sky visibility)**: Remove sunlight tile from RiskTilesGrid, remove sunlight detail view
- **Foundation Risk**: Part of Property Warnings removal

### AttentionSummary cleanup
- Remove all warning-based flags: foundation, erfpacht, vve, asbestos, lead_pipe
- Remove sunlight from risk scores
- Drop `warnings` and `sunlightScore` props (no longer needed)

### RiskTilesGrid: 4 tiles → 3 tiles
- Remove sunlight tile. Remaining: noise, air, climate
- Verify CSS grid handles 3 items (may need layout adjustment)

### Data fetching unchanged
- `propertyWarnings`, `sunlight`, etc. still fetched for PDF export
- Only viewer rendering removed

## Order 2: Single buy CTA

- Remove `t('premium.locked.upgradePrompt')` from `LockedSection.tsx`
- "Buy Full Dossier" button stays exclusively in ExportBottomSheet
- Remaining LockedSections (livability, 3D, crime, viewing questions) show title + subtitle only

## Order 3: Single viewing checklist CTA

- Remove "Download viewing checklist as PDF" list item from Next Steps section in App.tsx
- Update `action.exportBriefing` i18n key to include "(FREE)" / "(GRATIS)"

## Files touched

1. `App.tsx` — remove PropertyWarnings section, sunlight tile/detail props, next steps export item
2. `AttentionSummary.tsx` — remove warning flags, sunlight score, simplify props
3. `LockedSection.tsx` — remove upgrade prompt line
4. `RiskTilesGrid.tsx` / CSS — handle 3-tile layout
5. `en.json` + `nl.json` — update export briefing label
6. Tests — update affected assertions

## Files NOT touched

- `backend/app/services/pdf_export.py` — all items remain in PDF
- Backend endpoints — no changes
- `ExportBottomSheet.tsx` — already correct
- Data fetching logic in App.tsx — still fetch everything for PDF
