# Self-Healing Metrics (Conceptual)

**Document type:** Research protocol (future instrumentation)  
**Status:** Conceptual only — **do not add these metrics to the application yet**

When Embedded AI and/or the External Agent are implemented, they should expose Prometheus-compatible metrics that describe the MAPE-K loop outcomes. Experiment metadata belongs in experiment artifacts, not in high-cardinality labels.

---

## Counters

```text
self_healing_detections_total
self_healing_actions_total
self_healing_recoveries_total
self_healing_failures_total
```

## Histograms / summaries

```text
self_healing_detection_duration_seconds
self_healing_recovery_duration_seconds
```

Notes:

- `self_healing_detection_duration_seconds` may support analysis related to detection effort; **TTD** remains defined against the fault injection start timestamp ([`metrics.md`](metrics.md)).
- `self_healing_recovery_duration_seconds` may measure time from detection (or action) to criteria satisfaction; **TTR** remains defined against fault injection start.

---

## Allowed label guidance (low cardinality)

Potential labels:

```text
fault_type
action
result
```

Optional low-cardinality placement label if both mechanisms can coexist in lab infrastructure (not in the same comparative run):

```text
placement = embedded | external
```

---

## Forbidden as Prometheus labels

```text
experiment_id
request_id
order_id
trace_id
```

These belong in experiment run artifacts, logs (carefully), or traces — not metric label sets.

---

## Relationship to existing application metrics

Do **not** remove or replace current Order Service / Payment Service Prometheus metrics. They remain required for:

- External agent monitoring  
- Overhead and impact analysis  
- Recovery criteria evaluation  

See [`../docs/observability.md`](../docs/observability.md).
