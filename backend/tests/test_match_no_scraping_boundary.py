from pathlib import Path

SCRAPING_TERMS = (
    "beautifulsoup",
    "bs4",
    "selenium",
    "playwright",
    "scrapy",
    "requests.get",
    "httpx.get",
)


def test_match_listing_code_does_not_introduce_scraping_calls():
    listing_files = [
        Path("app/services/match/listings.py"),
        Path("app/services/match/providers/listings.py"),
        Path("app/api/match.py"),
    ]

    combined = "\n".join(path.read_text(encoding="utf-8").lower() for path in listing_files)

    for term in SCRAPING_TERMS:
        assert term not in combined

