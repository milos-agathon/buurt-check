"""One-time script to convert Satoshi .woff fonts to .ttf for fpdf2 embedding."""

from pathlib import Path

from fontTools.ttLib import TTFont

FRONTEND_FONTS = Path(__file__).parent.parent.parent / "frontend" / "public" / "fonts"
OUTPUT_DIR = Path(__file__).parent.parent / "app" / "assets" / "fonts"

WEIGHTS = ["Regular", "Bold", "Black", "Medium"]


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for weight in WEIGHTS:
        src = FRONTEND_FONTS / f"Satoshi-{weight}.woff"
        dst = OUTPUT_DIR / f"Satoshi-{weight}.ttf"
        if not src.exists():
            print(f"SKIP: {src} not found")
            continue
        font = TTFont(src)
        font.save(str(dst))
        print(f"OK: {src.name} -> {dst.name} ({dst.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
