#!/usr/bin/env bash
# Run experiment E000 (baseline) against Order Service with reproducibility metadata.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CTX="${KUBE_CONTEXT:-rooteny-kubernetes}"
NS="${KUBE_NAMESPACE:-ai-self-healing}"
BASE_URL="${BASE_URL:-http://127.0.0.1:3000}"
RATE="${RATE:-10}"
DURATION="${DURATION:-10m}"
OUT_DIR="${OUT_DIR:-$ROOT/load-testing/experiments/E000}"

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

echo "ORDER_SERVICE_IMAGE=${ORDER_SERVICE_IMAGE}"
echo "PAYMENT_SERVICE_IMAGE=${PAYMENT_SERVICE_IMAGE}"
echo "BASE_URL=${BASE_URL}"
echo "RATE=${RATE} DURATION=${DURATION}"
echo "OUT_DIR=${OUT_DIR}"
echo
echo "Ensure Order Service is reachable (e.g. port-forward svc/order-service 3000:3000)."
echo "Mark Grafana: E000 START"
echo

K6_VERSION="$(k6 version 2>&1 | head -n1 | awk '{print $2}')"

K6_WEB_DASHBOARD=true \
K6_WEB_DASHBOARD_OPEN=false \
K6_WEB_DASHBOARD_EXPORT="${OUT_DIR}/report.html" \
k6 run \
  -e "BASE_URL=${BASE_URL}" \
  -e "EXPERIMENT_ID=E000" \
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
  "${ROOT}/load-testing/scenarios/baseline.js"

echo
echo "Mark Grafana: E000 END"
echo "Wrote: ${OUT_DIR}/summary.json"
echo "Wrote: ${OUT_DIR}/report.html (if Web Dashboard export succeeded)"
