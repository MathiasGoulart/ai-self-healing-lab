#!/usr/bin/env bash
# Run E000 baseline repetitions (no fault, identical config).
# Usage: REPS="6 7 8" ./load-testing/run-e000-repeats.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${BASE_URL:-http://127.0.0.1:13000}"
RATE="${RATE:-10}"
DURATION="${DURATION:-10m}"
REPS="${REPS:-1 2 3 4 5}"
CTX="${KUBE_CONTEXT:-rooteny-kubernetes}"
NS="${KUBE_NAMESPACE:-ai-self-healing}"
VERIFY_FAULTS="${VERIFY_FAULTS:-1}"

assert_f01_off() {
  local label="$1"
  local tmp
  tmp="$(mktemp)"
  kubectl --context "$CTX" -n "$NS" port-forward svc/payment-service 13001:3001 >"$tmp" 2>&1 &
  local pf=$!
  sleep 2
  local faults metrics
  faults="$(curl -sf http://127.0.0.1:13001/faults)"
  metrics="$(curl -sf http://127.0.0.1:13001/metrics || true)"
  kill "$pf" 2>/dev/null || true
  wait "$pf" 2>/dev/null || true
  rm -f "$tmp"
  echo "${label}: ${faults}"
  python3 - "$faults" "$metrics" <<'PY'
import sys, json, re
faults = json.loads(sys.argv[1])
assert faults["faults"][0]["active"] is False, faults
metrics = sys.argv[2]
# Gauge may be absent until first activation; if present must be 0
for line in metrics.splitlines():
    if line.startswith("fault_injection_active{") and not line.startswith("#"):
        if not line.rstrip().endswith(" 0"):
            raise SystemExit(f"fault_injection_active not 0: {line}")
print("F01 confirmed OFF (API + metrics)")
PY
}

echo "=== E000 baseline repetitions ==="
echo "BASE_URL=${BASE_URL} RATE=${RATE} DURATION=${DURATION}"
echo "Repetitions: ${REPS}"
echo

reps_arr=(${REPS})
last="${reps_arr[${#reps_arr[@]}-1]}"

for n in ${REPS}; do
  id="E000-R${n}"
  echo "############################################"
  echo "# Starting ${id} at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "############################################"

  if [[ "${VERIFY_FAULTS}" == "1" ]]; then
    assert_f01_off "pre-${id}"
  fi

  # Record AC power at run start (verified)
  pmset -g batt | head -2 || true

  BASE_URL="${BASE_URL}" \
  RATE="${RATE}" \
  DURATION="${DURATION}" \
  EXPERIMENT_ID="${id}" \
  OUT_DIR="${ROOT}/load-testing/experiments/${id}" \
  SLEEP_PREVENTION="${SLEEP_PREVENTION:-caffeinate}" \
    "${ROOT}/load-testing/run-e000.sh"

  if [[ "${VERIFY_FAULTS}" == "1" ]]; then
    assert_f01_off "post-${id}"
  fi

  echo "# Finished ${id} at $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  if [[ "${n}" != "${last}" ]]; then
    sleep 15
  fi
done

echo "=== All E000 repetitions complete ==="
ls -la "${ROOT}/load-testing/experiments"/E000-R*/
