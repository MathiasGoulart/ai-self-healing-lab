#!/usr/bin/env bash
# Run experiment E000 (baseline) against Order Service with reproducibility metadata.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CTX="${KUBE_CONTEXT:-rooteny-kubernetes}"
NS="${KUBE_NAMESPACE:-ai-self-healing}"
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
RATE="${RATE:-10}"
DURATION="${DURATION:-10m}"
EXPERIMENT_ID="${EXPERIMENT_ID:-E000}"
OUT_DIR="${OUT_DIR:-$ROOT/load-testing/experiments/${EXPERIMENT_ID}}"

mkdir -p "$OUT_DIR"

if ! command -v k6 >/dev/null 2>&1; then
  echo "k6 is required. Install: https://k6.io/docs/get-started/installation/" >&2
  exit 1
fi

ORDER_SERVICE_IMAGE="${ORDER_SERVICE_IMAGE:-}"
PAYMENT_SERVICE_IMAGE="${PAYMENT_SERVICE_IMAGE:-}"

if [[ -z "$ORDER_SERVICE_IMAGE" || -z "$PAYMENT_SERVICE_IMAGE" ]]; then
  if command -v kubectl >/dev/null 2>&1; then
    echo "Capturing deployed image tags from ${CTX}/${NS}..."
    while IFS=$'\t' read -r name image; do
      case "$name" in
        order-service) ORDER_SERVICE_IMAGE="$image" ;;
        payment-service) PAYMENT_SERVICE_IMAGE="$image" ;;
      esac
    done < <(kubectl --context "$CTX" -n "$NS" get deploy order-service payment-service \
      -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.template.spec.containers[0].image}{"\n"}{end}')
  fi
fi

ORDER_SERVICE_IMAGE="${ORDER_SERVICE_IMAGE:-unknown}"
PAYMENT_SERVICE_IMAGE="${PAYMENT_SERVICE_IMAGE:-unknown}"

K6_VERSION="$(k6 version 2>&1 | head -n1 | awk '{print $2}')"

# Load-generator metadata: only verified fields (optional override via LOAD_GENERATOR_JSON)
if [[ -z "${LOAD_GENERATOR_JSON:-}" ]]; then
  POWER_SOURCE="unknown"
  if pmset -g batt 2>/dev/null | head -1 | grep -qi "AC Power"; then
    POWER_SOURCE="AC"
  elif pmset -g batt 2>/dev/null | head -1 | grep -qi "Battery Power"; then
    POWER_SOURCE="Battery"
  fi
  LOW_POWER="$(pmset -g 2>/dev/null | awk '/lowpowermode/{print $2; exit}')"
  LOAD_GENERATOR_JSON="$(
    POWER_SOURCE="$POWER_SOURCE" \
    LOW_POWER="$LOW_POWER" \
    K6_VERSION="$K6_VERSION" \
    SLEEP_PREVENTION="${SLEEP_PREVENTION:-unknown}" \
    python3 - <<'PY'
import json, platform, subprocess, os
mem = int(subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True).strip())
cpu = subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], text=True).strip()
ver = subprocess.check_output(["sw_vers", "-productVersion"], text=True).strip()
low = os.environ.get("LOW_POWER") or None
payload = {
    "platform": "macOS",
    "version": ver,
    "architecture": platform.machine(),
    "cpu": cpu,
    "memory_gb": round(mem / (1024**3)),
    "k6_version": os.environ["K6_VERSION"],
    "power_source": os.environ["POWER_SOURCE"],
    "lowpowermode": low,
    "sleep_prevention": os.environ.get("SLEEP_PREVENTION", "unknown"),
    "notes": [
        "Fields limited to values verified at run start.",
        "Closing of background apps is a manual operator step (not programmatically verified).",
        "System powernap setting is not modified by this runner; sleep is prevented via caffeinate when sleep_prevention=caffeinate.",
    ],
}
print(json.dumps(payload))
PY
  )"
fi

echo "ORDER_SERVICE_IMAGE=${ORDER_SERVICE_IMAGE}"
echo "PAYMENT_SERVICE_IMAGE=${PAYMENT_SERVICE_IMAGE}"
echo "BASE_URL=${BASE_URL}"
echo "RATE=${RATE} DURATION=${DURATION}"
echo "OUT_DIR=${OUT_DIR}"
echo "EXPERIMENT_ID=${EXPERIMENT_ID}"
echo "LOAD_GENERATOR_JSON=${LOAD_GENERATOR_JSON}"
echo
echo "Ensure Order Service is reachable (e.g. port-forward svc/order-service 3000:3000)."
echo "Mark Grafana: ${EXPERIMENT_ID} START"
echo

K6_WEB_DASHBOARD=true \
K6_WEB_DASHBOARD_OPEN=false \
K6_WEB_DASHBOARD_EXPORT="${OUT_DIR}/report.html" \
k6 run \
  -e "BASE_URL=${BASE_URL}" \
  -e "EXPERIMENT_ID=${EXPERIMENT_ID}" \
  -e "SCENARIO=baseline" \
  -e "RATE=${RATE}" \
  -e "DURATION=${DURATION}" \
  -e "PRE_ALLOCATED_VUS=${PRE_ALLOCATED_VUS:-20}" \
  -e "MAX_VUS=${MAX_VUS:-100}" \
  -e "REQUEST_TIMEOUT=${REQUEST_TIMEOUT:-10s}" \
  -e "OUT_DIR=${OUT_DIR}" \
  -e "ORDER_SERVICE_IMAGE=${ORDER_SERVICE_IMAGE}" \
  -e "PAYMENT_SERVICE_IMAGE=${PAYMENT_SERVICE_IMAGE}" \
  -e "K6_VERSION=${K6_VERSION}" \
  -e "LOAD_GENERATOR_JSON=${LOAD_GENERATOR_JSON}" \
  "${ROOT}/load-testing/scenarios/baseline.js"

echo
echo "Mark Grafana: ${EXPERIMENT_ID} END"
echo "Wrote: ${OUT_DIR}/summary.json"
echo "Wrote: ${OUT_DIR}/report.html (if Web Dashboard export succeeded)"
