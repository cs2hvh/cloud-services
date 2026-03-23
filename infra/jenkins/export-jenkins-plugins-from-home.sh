#!/usr/bin/env bash
set -euo pipefail

JENKINS_HOME="${1:-/srv/jenkins}"
PLUGINS_DIR="${JENKINS_HOME}/plugins"

if [[ ! -d "${PLUGINS_DIR}" ]]; then
  echo "plugins directory not found: ${PLUGINS_DIR}" >&2
  exit 1
fi

for d in "${PLUGINS_DIR}"/*/; do
  manifest="${d}META-INF/MANIFEST.MF"
  if [[ -f "${manifest}" ]]; then
    name=$(awk -F': ' '/^Short-Name:/{print $2; exit}' "${manifest}" | tr -d '\r')
    version=$(awk -F': ' '/^Plugin-Version:/{print $2; exit}' "${manifest}" | tr -d '\r')
    printf "%s:%s\n" "${name:-$(basename "${d%/}")}" "${version:-latest}"
  fi
done | sort
