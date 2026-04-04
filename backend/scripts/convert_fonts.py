"""Build static Inter TrueType instances for PDF export.

The old Satoshi webfont conversion produced CFF-backed OpenType fonts with a
`.ttf` extension. `fpdf2` embeds external fonts as CIDFontType2/FontFile2, so
those mislabeled files render on tolerant desktop viewers but break in iOS
PDFKit. This script generates real glyf-based TrueType instances from the
bundled Inter variable font for the weights used by the export pipeline.
"""

from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

OUTPUT_DIR = Path(__file__).parent.parent / "app" / "assets" / "fonts"
VARIABLE_FONT = OUTPUT_DIR / "Inter-Variable.ttf"
TARGETS = {
    "Inter-Regular.ttf": {"wght": 400.0, "opsz": 14.0},
    "Inter-Medium.ttf": {"wght": 500.0, "opsz": 14.0},
    "Inter-Bold.ttf": {"wght": 700.0, "opsz": 14.0},
    "Inter-Black.ttf": {"wght": 900.0, "opsz": 14.0},
}


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if not VARIABLE_FONT.exists():
        raise FileNotFoundError(f"Missing Inter variable font: {VARIABLE_FONT}")

    for filename, axes in TARGETS.items():
        font = TTFont(VARIABLE_FONT)
        static_font = instantiateVariableFont(
            font,
            axes,
            inplace=False,
            updateFontNames=True,
        )
        destination = OUTPUT_DIR / filename
        static_font.save(destination)
        print(
            f"OK: {VARIABLE_FONT.name} -> {destination.name} "
            f"({destination.stat().st_size // 1024} KB)"
        )


if __name__ == "__main__":
    main()
