#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
codex_home="${HOME}/.codex"
docker_socket="${DOCKER_SOCK_PATH:-/var/run/docker.sock}"
image="${CODEX_IN_DOCKER_IMAGE:-ubuntu:24.04}"
allow_host_docker="${CODEX_IN_DOCKER_ALLOW_HOST_DOCKER:-0}"
bootstrap_timeout_sec="${CODEX_IN_DOCKER_BOOTSTRAP_TIMEOUT_SEC:-300}"

json_escape() {
  local value="${1-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\t'/\\t}"
  printf '%s' "${value}"
}

render_error_json() {
  local code="${1}"
  local message="${2}"

  printf '{\n'
  printf '  "error": {\n'
  printf '    "code": "%s",\n' "$(json_escape "${code}")"
  printf '    "message": "%s",\n' "$(json_escape "${message}")"
  printf '    "details": null\n'
  printf '  }\n'
  printf '}\n'
}

fail() {
  render_error_json "${1}" "${2}"
  exit 1
}

if ! command -v docker >/dev/null 2>&1; then
  fail "DOCKER_UNAVAILABLE" "Host docker binary not found in PATH."
fi

if [[ "${allow_host_docker}" == "1" && ! -S "${docker_socket}" ]]; then
  fail "DOCKER_SOCKET_UNAVAILABLE" "Docker socket not found at ${docker_socket}. Start Docker or set DOCKER_SOCK_PATH."
fi

mkdir -p "${codex_home}"

docker_args=(
  run
  --rm
  --init
  --mount "type=bind,src=${project_root},dst=${project_root}"
  --mount "type=bind,src=${codex_home},dst=/root/.codex"
  -e "CODEX_IN_DOCKER_ALLOW_HOST_DOCKER=${allow_host_docker}"
  -e "CODEX_IN_DOCKER_BOOTSTRAP_TIMEOUT_SEC=${bootstrap_timeout_sec}"
  -w "${project_root}"
)

if [[ "${allow_host_docker}" == "1" ]]; then
  docker_args+=(
    --mount "type=bind,src=${docker_socket},dst=/var/run/docker.sock"
    -e "DOCKER_HOST=unix:///var/run/docker.sock"
  )
fi

if [[ -t 0 && -t 1 ]]; then
  docker_args+=(-it)
fi

for env_name in \
  AZURE_OPENAI_API_KEY \
  OPENSHRIKE_AZURE_OPENAI_BASE_URL \
  OPENSHRIKE_AZURE_OPENAI_API_VERSION
do
  if [[ -n "${!env_name:-}" ]]; then
    docker_args+=(-e "${env_name}=${!env_name}")
  fi
done

docker "${docker_args[@]}" "${image}" bash -lc '
  set -euo pipefail

  export DEBIAN_FRONTEND=noninteractive
  bootstrap_timeout_sec="${CODEX_IN_DOCKER_BOOTSTRAP_TIMEOUT_SEC:-300}"

  run_with_timeout() {
    timeout --foreground "${bootstrap_timeout_sec}s" "$@"
  }

  run_with_timeout apt-get update
  run_with_timeout apt-get install -y curl ca-certificates gnupg

  run_with_timeout curl --connect-timeout 30 --max-time "${bootstrap_timeout_sec}" \
    -fsSL https://deb.nodesource.com/setup_22.x \
    -o /tmp/nodesource-setup.sh
  run_with_timeout bash /tmp/nodesource-setup.sh
  run_with_timeout apt-get install -y nodejs

  if [[ "${CODEX_IN_DOCKER_ALLOW_HOST_DOCKER:-0}" == "1" ]]; then
    run_with_timeout apt-get install -y docker.io
  fi

  run_with_timeout npm install -g @openai/codex

  if [ "$#" -gt 0 ]; then
    exec "$@"
  fi

  exec bash
' bash "$@"
