#!/usr/bin/env bash
set -euo pipefail

MODE="${BUURTCHECK_TEX_INSTALL_MODE:-tlmgr}"

APT_PACKAGES=(
  texlive-base
  texlive-luatex
  texlive-latex-extra
  texlive-fonts-extra
)

TLMGR_PACKAGES=(
  luatex
  latexmk
  geometry
  fontspec
  xcolor
  graphics
  tools
  array
  booktabs
  longtable
  hyperref
  enumitem
  fancyhdr
  lastpage
)

run_apt() {
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "apt-get not found; cannot run apt install mode" >&2
    exit 1
  fi

  local sudo_cmd=""
  if [[ "${EUID}" -ne 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
      sudo_cmd="sudo"
    else
      echo "Need root privileges for apt mode (sudo missing)." >&2
      exit 1
    fi
  fi

  ${sudo_cmd} apt-get update
  ${sudo_cmd} DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "${APT_PACKAGES[@]}"
}

run_tlmgr() {
  if ! command -v tlmgr >/dev/null 2>&1; then
    echo "tlmgr not found; install TinyTeX/TeX Live first" >&2
    exit 1
  fi

  tlmgr install "${TLMGR_PACKAGES[@]}"
}

case "${MODE}" in
  apt)
    echo "Installing TeX dependencies via apt..."
    run_apt
    ;;
  tlmgr)
    echo "Installing TeX dependencies via tlmgr..."
    run_tlmgr
    ;;
  *)
    echo "Unsupported BUURTCHECK_TEX_INSTALL_MODE='${MODE}'. Use 'apt' or 'tlmgr'." >&2
    exit 1
    ;;
esac

echo "TeX dependency installation complete."

