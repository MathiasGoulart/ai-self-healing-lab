#!/usr/bin/env bash
# Formal E001 fault-characterization run (F01 medium, no self-healing).
# Timeline: 0–3m baseline → 3–6m F01 active → 6–10m recovery observation.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CTX="${KUBE_CONTEXT:-rooteny-kubernetes}"
NS="${KUBE_NAMESPACE:-ai-self-healing}"
OBS_NS="${OBS_NAMESPACE:-observability}"
BASE_URL="${BASE_URL:-http://127.0.0.1:13000}"
PAYMENT_URL="${PAYMENT_URL:-http://127.0.0.1:13001}"
PROM_URL="${PROM_URL:-http://127.0.0.1:19090}"
RATE="${RATE:-10}"
DURATION="${DURATION:-10m}"
EXPERIMENT_ID="${EXPERIMENT_ID:-E001}"
OUT_DIR="${OUT_DIR:-$ROOT/load-testing/experiments/${EXPERIMENT_ID}}"
ORDER_PF_LOCAL="${ORDER_PF_LOCAL:-13000}"
PAYMENT_PF_LOCAL="${PAYMENT_PF_LOCAL:-13001}"
PROM_PF_LOCAL="${PROM_PF_LOCAL:-19090}"
FAULT_ACTIVATE_AFTER_SEC="${FAULT_ACTIVATE_AFTER_SEC:-180}"
FAULT_DEACTIVATE_AFTER_SEC="${FAULT_DEACTIVATE_AFTER_SEC:-360}"
PRE_ALLOCATED_VUS="${PRE_ALLOCATED_VUS:-40}"
MAX_VUS="${MAX_VUS:-120}"
REQUEST_TIMEOUT="${REQUEST_TIMEOUT:-15s}"

mkdir -p "$OUT_DIR"
TIMELINE_JSON="$OUT_DIR/timeline.json"
CONTROL_LOG="$OUT_DIR/control.log"

log() {
  local msg="$*"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $msg" | tee -a "$CONTROL_LOG"
}

cleanup() {
  if [[ -n "${K6_PID:-}" ]] && kill -0 "$K6_PID" 2>/dev/null; then
    kill "$K6_PID" 2>/dev/null || true
  fi
  if [[ -n "${CAFFEINATE_PID:-}" ]] && kill -0 "$CAFFEINATE_PID" 2>/dev/null; then
    kill "$CAFFEINATE_PID" 2>/dev/null || true
  fi
  # Leave port-forwards running if we did not start them (operator-managed).
  if [[ "${STARTED_ORDER_PF:-0}" == "1" ]] && [[ -n "${ORDER_PF_PID:-}" ]]; then
    kill "$ORDER_PF_PID" 2>/dev/null || true
  fi
  if [[ "${STARTED_PAYMENT_PF:-0}" == "1" ]] && [[ -n "${PAYMENT_PF_PID:-}" ]]; then
    kill "$PAYMENT_PF_PID" 2>/dev/null || true
  fi
  if [[ "${STARTED_PROM_PF:-0}" == "1" ]] && [[ -n "${PROM_PF_PID:-}" ]]; then
    kill "$PROM_PF_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

ensure_port_forward() {
  local kind="$1" ns="$2" svc="$3" local_port="$4" remote_port="$5"
  if nc -z 127.0.0.1 "$local_port" 2>/dev/null; then
    return 0
  fi
  log "Starting port-forward ${svc} ${local_port}:${remote_port}"
  kubectl --context "$CTX" -n "$ns" port-forward "svc/${svc}" "${local_port}:${remote_port}" \
    >"$OUT_DIR/pf-${kind}.log" 2>&1 &
  local pid=$!
  sleep 2
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "port-forward ${svc} failed; see $OUT_DIR/pf-${kind}.log" >&2
    exit 1
  fi
  case "$kind" in
    order) ORDER_PF_PID=$pid; STARTED_ORDER_PF=1 ;;
    payment) PAYMENT_PF_PID=$pid; STARTED_PAYMENT_PF=1 ;;
    prom) PROM_PF_PID=$pid; STARTED_PROM_PF=1 ;;
  esac
}

iso_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }
epoch_now() { date +%s; }

assert_f01_off() {
  local label="$1"
  local faults
  faults="$(curl -sf "${PAYMENT_URL}/faults")"
  log "${label}: ${faults}"
  python3 - "$faults" <<'PY'
import sys, json
faults = json.loads(sys.argv[1])
assert faults["faults"][0]["active"] is False, faults
print("F01 confirmed OFF")
PY
}

# --- Preflight ---------------------------------------------------------------

: >"$CONTROL_LOG"
log "=== E001 formal run preflight ==="

if ! command -v k6 >/dev/null 2>&1; then
  echo "k6 is required" >&2
  exit 1
fi

ensure_port_forward order "$NS" order-service "$ORDER_PF_LOCAL" 3000
ensure_port_forward payment "$NS" payment-service "$PAYMENT_PF_LOCAL" 3001
ensure_port_forward prom "$OBS_NS" kps-prometheus "$PROM_PF_LOCAL" 9090

# Re-resolve URLs from ports (in case defaults changed)
BASE_URL="http://127.0.0.1:${ORDER_PF_LOCAL}"
PAYMENT_URL="http://127.0.0.1:${PAYMENT_PF_LOCAL}"
PROM_URL="http://127.0.0.1:${PROM_PF_LOCAL}"

ORDER_SERVICE_IMAGE="$(kubectl --context "$CTX" -n "$NS" get deploy order-service \
  -o jsonpath='{.spec.template.spec.containers[0].image}')"
PAYMENT_SERVICE_IMAGE="$(kubectl --context "$CTX" -n "$NS" get deploy payment-service \
  -o jsonpath='{.spec.template.spec.containers[0].image}')"

POWER_SOURCE="unknown"
if pmset -g batt 2>/dev/null | head -1 | grep -qi "AC Power"; then
  POWER_SOURCE="AC"
elif pmset -g batt 2>/dev/null | head -1 | grep -qi "Battery Power"; then
  POWER_SOURCE="Battery"
fi
LOW_POWER="$(pmset -g 2>/dev/null | awk '/lowpowermode/{print $2; exit}')"

# Soft readiness checks
curl -sf -X POST "${BASE_URL}/orders" -H 'Content-Type: application/json' \
  -d '{"productId":"product-123","quantity":1}' >/dev/null
curl -sf "${PAYMENT_URL}/faults" >/dev/null
curl -sf "${PROM_URL}/-/ready" >/dev/null

assert_f01_off "pre-E001"

log "ORDER_SERVICE_IMAGE=${ORDER_SERVICE_IMAGE}"
log "PAYMENT_SERVICE_IMAGE=${PAYMENT_SERVICE_IMAGE}"
log "BASE_URL=${BASE_URL} PAYMENT_URL=${PAYMENT_URL}"
log "RATE=${RATE} DURATION=${DURATION} PRE_ALLOCATED_VUS=${PRE_ALLOCATED_VUS} MAX_VUS=${MAX_VUS}"
log "power_source=${POWER_SOURCE} lowpowermode=${LOW_POWER}"
log "Grafana annotation convention: E001_START / F01_ACTIVATED / F01_DEACTIVATED / E001_END (manual)"

# --- Start load + caffeinate -------------------------------------------------

caffeinate -dims &
CAFFEINATE_PID=$!
SLEEP_PREVENTION="caffeinate"

E001_START_UTC="$(iso_now)"
E001_START_EPOCH="$(epoch_now)"
log "E001_START ${E001_START_UTC}"

LOAD_GENERATOR_JSON="$(
  POWER_SOURCE="$POWER_SOURCE" \
  LOW_POWER="$LOW_POWER" \
  SLEEP_PREVENTION="$SLEEP_PREVENTION" \
  K6_VERSION="$(k6 version 2>&1 | head -n1 | awk '{print $2}')" \
  python3 - <<'PY'
import json, platform, subprocess, os
mem = int(subprocess.check_output(["sysctl", "-n", "hw.memsize"], text=True).strip())
cpu = subprocess.check_output(["sysctl", "-n", "machdep.cpu.brand_string"], text=True).strip()
ver = subprocess.check_output(["sw_vers", "-productVersion"], text=True).strip()
print(json.dumps({
    "platform": "macOS",
    "version": ver,
    "architecture": platform.machine(),
    "cpu": cpu,
    "memory_gb": round(mem / (1024**3)),
    "k6_version": os.environ["K6_VERSION"],
    "power_source": os.environ["POWER_SOURCE"],
    "lowpowermode": os.environ.get("LOW_POWER"),
    "sleep_prevention": os.environ.get("SLEEP_PREVENTION", "unknown"),
}))
PY
)"

# Run k6 via existing runner in background so handleSummary still works
(
  BASE_URL="$BASE_URL" \
  RATE="$RATE" \
  DURATION="$DURATION" \
  EXPERIMENT_ID="$EXPERIMENT_ID" \
  OUT_DIR="$OUT_DIR" \
  PRE_ALLOCATED_VUS="$PRE_ALLOCATED_VUS" \
  MAX_VUS="$MAX_VUS" \
  REQUEST_TIMEOUT="$REQUEST_TIMEOUT" \
  ORDER_SERVICE_IMAGE="$ORDER_SERVICE_IMAGE" \
  PAYMENT_SERVICE_IMAGE="$PAYMENT_SERVICE_IMAGE" \
  LOAD_GENERATOR_JSON="$LOAD_GENERATOR_JSON" \
  SLEEP_PREVENTION="$SLEEP_PREVENTION" \
  "$ROOT/load-testing/run-e000.sh"
) >"$OUT_DIR/k6-runner.log" 2>&1 &
K6_PID=$!

log "k6 runner started pid=${K6_PID}"

# Wait until activate
TARGET_ACTIVATE=$((E001_START_EPOCH + FAULT_ACTIVATE_AFTER_SEC))
while [[ "$(epoch_now)" -lt "$TARGET_ACTIVATE" ]]; do
  if ! kill -0 "$K6_PID" 2>/dev/null; then
    log "ERROR: k6 exited before fault activation"
    tail -n 80 "$OUT_DIR/k6-runner.log" || true
    exit 1
  fi
  sleep 1
done

ACTIVATE_BODY='{"fault":"payment_latency","severity":"medium"}'
ACTIVATE_RESP="$(curl -sf -X POST "${PAYMENT_URL}/faults" \
  -H 'Content-Type: application/json' \
  -d "$ACTIVATE_BODY")"
T0_UTC="$(iso_now)"
T0_EPOCH="$(epoch_now)"
log "F01_ACTIVATED (T0) ${T0_UTC} response=${ACTIVATE_RESP}"
echo "$ACTIVATE_RESP" >"$OUT_DIR/fault_activate_response.json"

# Wait until deactivate
TARGET_DEACTIVATE=$((E001_START_EPOCH + FAULT_DEACTIVATE_AFTER_SEC))
while [[ "$(epoch_now)" -lt "$TARGET_DEACTIVATE" ]]; do
  if ! kill -0 "$K6_PID" 2>/dev/null; then
    log "ERROR: k6 exited before fault deactivation"
    tail -n 80 "$OUT_DIR/k6-runner.log" || true
    exit 1
  fi
  sleep 1
done

DEACTIVATE_RESP="$(curl -sf -X DELETE "${PAYMENT_URL}/faults/payment_latency")"
FAULT_OFF_UTC="$(iso_now)"
FAULT_OFF_EPOCH="$(epoch_now)"
log "F01_DEACTIVATED ${FAULT_OFF_UTC} response=${DEACTIVATE_RESP}"
echo "$DEACTIVATE_RESP" >"$OUT_DIR/fault_deactivate_response.json"

# Wait for k6 to finish
set +e
wait "$K6_PID"
K6_EXIT=$?
set -e
K6_PID=""
E001_END_UTC="$(iso_now)"
E001_END_EPOCH="$(epoch_now)"
log "E001_END ${E001_END_UTC} k6_exit=${K6_EXIT}"

if [[ "$K6_EXIT" -ne 0 ]]; then
  log "WARNING: k6 exited non-zero; see $OUT_DIR/k6-runner.log"
  tail -n 100 "$OUT_DIR/k6-runner.log" || true
fi

# Confirm F01 off after run
assert_f01_off "post-E001" || true

# --- Write timeline ----------------------------------------------------------

python3 - "$TIMELINE_JSON" <<PY
import json
payload = {
  "experiment_id": "${EXPERIMENT_ID}",
  "status": "executed",
  "self_healing": False,
  "ai_placement": None,
  "fault": {
    "id": "F01",
    "name": "payment_latency",
    "severity": "medium",
    "parameter_ms": 2000
  },
  "images": {
    "order_service": "${ORDER_SERVICE_IMAGE}",
    "payment_service": "${PAYMENT_SERVICE_IMAGE}"
  },
  "workload": {
    "base_url": "${BASE_URL}",
    "rate": ${RATE},
    "duration": "${DURATION}",
    "pre_allocated_vus": ${PRE_ALLOCATED_VUS},
    "max_vus": ${MAX_VUS},
    "request_timeout": "${REQUEST_TIMEOUT}"
  },
  "load_generator": {
    "power_source": "${POWER_SOURCE}",
    "lowpowermode": "${LOW_POWER}",
    "sleep_prevention": "${SLEEP_PREVENTION}"
  },
  "annotations": {
    "E001_START": {"utc": "${E001_START_UTC}", "epoch": ${E001_START_EPOCH}},
    "F01_ACTIVATED": {"utc": "${T0_UTC}", "epoch": ${T0_EPOCH}, "symbol": "T0"},
    "F01_DEACTIVATED": {"utc": "${FAULT_OFF_UTC}", "epoch": ${FAULT_OFF_EPOCH}},
    "E001_END": {"utc": "${E001_END_UTC}", "epoch": ${E001_END_EPOCH}}
  },
  "planned_offsets_sec": {
    "fault_activate_after_sec": ${FAULT_ACTIVATE_AFTER_SEC},
    "fault_deactivate_after_sec": ${FAULT_DEACTIVATE_AFTER_SEC}
  },
  "observed_offsets_sec": {
    "t0_minus_start": ${T0_EPOCH} - ${E001_START_EPOCH},
    "deactivate_minus_start": ${FAULT_OFF_EPOCH} - ${E001_START_EPOCH},
    "end_minus_start": ${E001_END_EPOCH} - ${E001_START_EPOCH}
  },
  "grafana_annotations_note": "Recorded here for operator/manual Grafana annotation; not auto-posted.",
  "evaluation": {
    "primary_sli": "order_processing_duration_seconds_p95",
    "sampling_window_seconds": 30,
    "threshold_ms": 500,
    "degradation_rule": "2_of_3_rolling_windows_p95_gt_500ms",
    "recovery_rule": "2_of_3_rolling_windows_p95_lt_500ms",
    "t1_t3_computed_in": "prometheus_windows.json / evaluation.json"
  },
  "k6_exit_code": ${K6_EXIT}
}
with open("${TIMELINE_JSON}", "w") as f:
    json.dump(payload, f, indent=2)
    f.write("\\n")
print("Wrote ${TIMELINE_JSON}")
PY

# --- Query Prometheus primary SLI windows ------------------------------------

START_Q="${E001_START_EPOCH}"
END_Q=$((E001_END_EPOCH + 30))
QUERY='histogram_quantile(0.95,sum by (le) (rate(order_processing_duration_seconds_bucket{job="order-service"}[30s])))'

curl -sgG "${PROM_URL}/api/v1/query_range" \
  --data-urlencode "query=${QUERY}" \
  --data-urlencode "start=${START_Q}" \
  --data-urlencode "end=${END_Q}" \
  --data-urlencode "step=30" \
  >"$OUT_DIR/prometheus_query_range_raw.json"

python3 - "$OUT_DIR" "$E001_START_EPOCH" "$T0_EPOCH" "$FAULT_OFF_EPOCH" "$E001_END_EPOCH" <<'PY'
import json, math, os, sys
from pathlib import Path

out = Path(sys.argv[1])
start_e, t0, t_off, end_e = map(int, sys.argv[2:6])
threshold = 0.5  # seconds

raw = json.loads((out / "prometheus_query_range_raw.json").read_text())
if raw.get("status") != "success":
    raise SystemExit(f"prometheus query failed: {raw}")

series = raw["data"]["result"]
values = series[0]["values"] if series else []

windows = []
for ts, val in values:
    ts = int(float(ts))
    try:
        v = float(val)
        if math.isnan(v):
            v = None
    except Exception:
        v = None
    phase = "baseline"
    if ts >= t_off:
        phase = "recovery"
    elif ts >= t0:
        phase = "fault"
    windows.append({
        "epoch": ts,
        "utc": __import__("datetime").datetime.fromtimestamp(ts, __import__("datetime").timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "p95_seconds": v,
        "p95_ms": None if v is None else round(v * 1000, 3),
        "above_500ms": None if v is None else (v > threshold),
        "below_500ms": None if v is None else (v < threshold),
        "phase": phase,
        "offset_from_start_sec": ts - start_e,
        "offset_from_t0_sec": ts - t0,
    })

# Rolling 2-of-3 evaluation at each window end (need 3 points)
state = "HEALTHY"
t1 = None
t3 = None
transitions = []
evals = []
for i in range(2, len(windows)):
    trio = windows[i-2:i+1]
    if any(w["p95_seconds"] is None for w in trio):
        evals.append({
            "at_epoch": windows[i]["epoch"],
            "at_utc": windows[i]["utc"],
            "windows": [w["epoch"] for w in trio],
            "skipped": True,
            "reason": "missing_p95",
            "state": state,
        })
        continue
    n_above = sum(1 for w in trio if w["above_500ms"])
    n_below = sum(1 for w in trio if w["below_500ms"])
    prev = state
    if state == "HEALTHY" and n_above >= 2:
        state = "DEGRADED"
        if t1 is None:
            t1 = windows[i]["epoch"]
        transitions.append({
            "from": prev, "to": state,
            "at_epoch": windows[i]["epoch"],
            "at_utc": windows[i]["utc"],
            "rule": "2_of_3_p95_gt_500ms",
            "trio_p95_ms": [w["p95_ms"] for w in trio],
        })
    elif state == "DEGRADED" and n_below >= 2:
        state = "HEALTHY"
        if t3 is None:
            t3 = windows[i]["epoch"]
        transitions.append({
            "from": prev, "to": state,
            "at_epoch": windows[i]["epoch"],
            "at_utc": windows[i]["utc"],
            "rule": "2_of_3_p95_lt_500ms",
            "trio_p95_ms": [w["p95_ms"] for w in trio],
        })
    evals.append({
        "at_epoch": windows[i]["epoch"],
        "at_utc": windows[i]["utc"],
        "windows": [w["epoch"] for w in trio],
        "trio_p95_ms": [w["p95_ms"] for w in trio],
        "n_above_500ms": n_above,
        "n_below_500ms": n_below,
        "state_after": state,
        "skipped": False,
    })

def dur(a, b):
    if a is None or b is None:
        return None
    return b - a

evaluation = {
    "threshold_seconds": threshold,
    "threshold_ms": 500,
    "rule": "rolling_2_of_3_30s_windows",
    "t0_epoch": t0,
    "t1_degradation_detected_epoch": t1,
    "t1_utc": None if t1 is None else __import__("datetime").datetime.fromtimestamp(t1, __import__("datetime").timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "t2": None,
    "t2_note": "N/A — no self-healing action",
    "fault_deactivated_epoch": t_off,
    "t3_recovery_confirmed_epoch": t3,
    "t3_utc": None if t3 is None else __import__("datetime").datetime.fromtimestamp(t3, __import__("datetime").timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "ttd_seconds": dur(t0, t1),
    "ttr_seconds": dur(t0, t3),
    "ttr_note": "Observed recovery after manual fault deactivation; not self-healing",
    "final_state": state,
    "transitions": transitions,
    "evaluations": evals,
}

(out / "prometheus_windows.json").write_text(json.dumps({
    "query": "histogram_quantile(0.95,sum by (le) (rate(order_processing_duration_seconds_bucket{job=\"order-service\"}[30s])))",
    "step_seconds": 30,
    "start_epoch": start_e,
    "end_epoch": end_e,
    "windows": windows,
}, indent=2) + "\n")

(out / "evaluation.json").write_text(json.dumps(evaluation, indent=2) + "\n")

print(json.dumps({
    "windows": len(windows),
    "t1": evaluation["t1_utc"],
    "t3": evaluation["t3_utc"],
    "ttd_seconds": evaluation["ttd_seconds"],
    "ttr_seconds": evaluation["ttr_seconds"],
    "final_state": state,
    "transitions": len(transitions),
}, indent=2))
PY

log "Artifacts in ${OUT_DIR}"
ls -la "$OUT_DIR" | tee -a "$CONTROL_LOG"
log "Done."
exit "$K6_EXIT"
