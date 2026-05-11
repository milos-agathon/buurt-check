# Polar Frost Palette

Canonical source: `stitch_buurt_check_property_briefing/stitch_buurt_check_property_briefing/polar_frost/DESIGN.md`

Implementation source: `frontend/src/styles/tokens.css`

Last aligned: 2026-05-07

## Usage Rules

- Use this file as the palette authority for product writing, specs, implementation plans, UI prompts, screenshots, and QA notes.
- Teal is the only primary action hue. Use `#0D9488` for fills and `#00685F` for teal text/icons on light backgrounds.
- The tertiary palette is the warm evidence/caution family. Use `#C36D4B` as the named mid tertiary swatch in writing and charts that need a warm non-severity benchmark.
- Risk severity colors are separate from the tertiary palette. Do not use tertiary as a risk score color.
- Avoid pre-Stitch bright teal values in new docs or UI; use the primary teal roles below instead.

## Core Surfaces

| Role | Hex | Use |
|---|---:|---|
| Background | `#F9FAFB` | Main app and landing canvas |
| Surface | `#F5FAF8` | Default Stitch surface |
| Surface bright | `#F5FAF8` | Bright tonal surface |
| Surface dim | `#D6DBD9` | Dim tonal surface |
| Surface container lowest | `#FFFFFF` | Cards, sheets, legal document surfaces |
| Surface container low | `#F0F5F2` | Recessed grouped rows |
| Surface container | `#EAEFED` | Tonal containers |
| Surface container high | `#E4E9E7` | Raised tonal containers |
| Surface container highest | `#DEE4E1` | Highest tonal containers and surface variant |
| Frost block | `#F0F4F8` | Product preview blocks and grouped evidence areas |
| Border | `#E2E8F0` | Low-contrast borders and dividers |
| Outline variant | `#BCC9C6` | Stronger dividers and subtle outlines |
| Outline | `#6D7A77` | Tertiary text, placeholders, disabled hints |

## Text And Inverse

| Role | Hex | Use |
|---|---:|---|
| On surface | `#171D1C` | Primary text, headings, wordmark |
| On surface variant | `#3D4947` | Secondary text, metadata, explanatory copy |
| Inverse surface | `#2C3130` | Dark surfaces and dark mode panels |
| Inverse on surface | `#EDF2F0` | Text on inverse/dark surfaces |
| On background | `#171D1C` | Text on page background |

## Primary Teal

| Role | Hex | Use |
|---|---:|---|
| Primary action | `#0D9488` | Primary button fills, active controls |
| Primary | `#00685F` | Hover states and teal text/icons on light backgrounds |
| Primary container | `#008378` | Strong tonal teal containers |
| Surface tint | `#006A61` | Material tint and tonal overlays |
| On primary | `#FFFFFF` | Text/icons on primary fills |
| On primary container | `#F4FFFC` | Text/icons on primary containers |
| Primary fixed | `#89F5E7` | Light teal emphasis |
| Primary fixed dim | `#6BD8CB` | Dark mode accent and lower-emphasis teal |
| On primary fixed | `#00201D` | Text on primary fixed |
| On primary fixed variant | `#005049` | Deep teal text and outlines |
| Sage tint | `#ECFDF5` | Selected state backgrounds and soft teal wash |
| Inverse primary | `#6BD8CB` | Teal on inverse surfaces |

## Secondary Green Gray

| Role | Hex | Use |
|---|---:|---|
| Secondary | `#5A5F62` | Informational neutral markers |
| On secondary | `#FFFFFF` | Text/icons on secondary fills |
| Secondary container | `#DCE0E4` | Neutral badges and grouped controls |
| On secondary container | `#5E6367` | Text on secondary containers |
| Secondary fixed | `#DFE3E7` | Fixed neutral container |
| Secondary fixed dim | `#C3C7CB` | Dim fixed neutral container |
| On secondary fixed | `#171C1F` | Text on secondary fixed |
| On secondary fixed variant | `#43474B` | Variant text on secondary fixed |

## Tertiary Warm Palette

| Role | Hex | Use |
|---|---:|---|
| Tertiary | `#924628` | Deep warm tertiary text/ink on pale backgrounds |
| Tertiary mid | `#C36D4B` | Named warm evidence/caution swatch for writing, charts, and benchmarks |
| Tertiary container | `#B05E3D` | Strong warm container and benchmark color |
| On tertiary | `#FFFFFF` | Text/icons on deep tertiary fills |
| On tertiary container | `#FFFBFF` | Text/icons on tertiary container |
| Tertiary fixed | `#FFDBCE` | Pale warm background |
| Tertiary fixed dim | `#FFB59A` | Dark-mode warm accent and soft warm emphasis |
| On tertiary fixed | `#370E00` | Text on pale warm backgrounds |
| On tertiary fixed variant | `#773215` | Warm text variant |

## Error And Risk

| Role | Hex | Use |
|---|---:|---|
| Error | `#BA1A1A` | Stitch error role |
| On error | `#FFFFFF` | Text/icons on error fills |
| Error container | `#FFDAD6` | Error backgrounds |
| On error container | `#93000A` | Text on error backgrounds |
| Risk good | `#22C55E` | Score 70-100 |
| Risk moderate | `#EAB308` | Score 40-69 |
| Risk poor | `#EF4444` | Score 20-39 |
| Risk critical | `#B91C1C` | Score 0-19 |
| Risk unavailable | `#6D7A77` | Missing or unavailable data |

## Dark Mode Mapping

| Token | Light | Dark |
|---|---:|---:|
| `--color-bg` | `#F9FAFB` | `#171D1C` |
| `--color-surface` | `#FFFFFF` | `#2C3130` |
| `--color-surface-alt` | `#F0F4F8` | `#3D4947` |
| `--color-surface-recessed` | `#F0F5F2` | `#232827` |
| `--color-border` | `#E2E8F0` | `#6D7A77` |
| `--color-text` | `#171D1C` | `#EDF2F0` |
| `--color-text-secondary` | `#3D4947` | `#BCC9C6` |
| `--color-text-tertiary` | `#6D7A77` | `#D6DBD9` |
| `--color-accent` | `#0D9488` | `#6BD8CB` |
| `--color-accent-text` | `#00685F` | `#89F5E7` |
| `--color-tertiary` | `#C36D4B` | `#FFB59A` |
