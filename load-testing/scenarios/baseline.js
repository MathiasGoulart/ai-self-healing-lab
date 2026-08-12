/**
 * Baseline business workload for the AI Self-Healing Lab.
 *
 * One iteration = one complete business flow:
 *   POST /orders  →  POST /orders/:id/process
 *
 * With constant-arrival-rate RATE=10, that is:
 *   ~10 business flows / second
 *   ~20 HTTP requests / second (under healthy conditions)
 *
 * Arrival rate is independent of request latency (extra VUs are allocated as needed).
 * No automatic retries — failures are recorded and the iteration ends.
 */

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

// --- Configuration (env) ----------------------------------------------------

const BASE_URL = (__ENV.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const EXPERIMENT_ID = __ENV.EXPERIMENT_ID || 'E000';
const SCENARIO = __ENV.SCENARIO || 'baseline';
const RATE = Number(__ENV.RATE || 10);
const DURATION = __ENV.DURATION || '10m';
const PRE_ALLOCATED_VUS = Number(__ENV.PRE_ALLOCATED_VUS || 20);
const MAX_VUS = Number(__ENV.MAX_VUS || 100);
const REQUEST_TIMEOUT = __ENV.REQUEST_TIMEOUT || '10s';
const OUT_DIR = __ENV.OUT_DIR || `load-testing/experiments/${EXPERIMENT_ID}`;
const ORDER_SERVICE_IMAGE = __ENV.ORDER_SERVICE_IMAGE || 'unknown';
const PAYMENT_SERVICE_IMAGE = __ENV.PAYMENT_SERVICE_IMAGE || 'unknown';
const PRODUCT_ID = __ENV.PRODUCT_ID || 'product-123';

// --- Custom metrics (client-side / k6) --------------------------------------

const orderCreationSuccess = new Counter('order_creation_success');
const orderCreationFailure = new Counter('order_creation_failure');
const orderProcessingSuccess = new Counter('order_processing_success');
const orderProcessingFailure = new Counter('order_processing_failure');
const orderFlowDuration = new Trend('order_flow_duration', true);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const options = {
  // Summary percentiles for experiment artifacts (does not change workload).
  // Authoritative degradation remains server-side order-processing p95 (protocol freeze).
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  scenarios: {
    baseline: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: PRE_ALLOCATED_VUS,
      maxVUs: MAX_VUS,
      gracefulStop: '5s',
      tags: {
        experiment_id: EXPERIMENT_ID,
        scenario: SCENARIO,
      },
    },
  },
  // No performance thresholds yet — E000 establishes the empirical baseline first.
  thresholds: {},
};

export function setup() {
  const metadata = {
    experiment_id: EXPERIMENT_ID,
    scenario: SCENARIO,
    timestamp_utc: new Date().toISOString(),
    base_url: BASE_URL,
    order_service_image: ORDER_SERVICE_IMAGE,
    payment_service_image: PAYMENT_SERVICE_IMAGE,
    k6_version: __ENV.K6_VERSION || 'see-local-k6-version',
    rate_iterations_per_second: RATE,
    duration: DURATION,
    pre_allocated_vus: PRE_ALLOCATED_VUS,
    max_vus: MAX_VUS,
    request_timeout: REQUEST_TIMEOUT,
    notes: {
      iteration_meaning:
        '1 iteration = POST /orders + POST /orders/:id/process (~2 HTTP requests when healthy)',
      grafana_annotations: [`${EXPERIMENT_ID} START`, `${EXPERIMENT_ID} END`],
      no_retries: true,
    },
  };

  console.log(`EXPERIMENT_METADATA ${JSON.stringify(metadata)}`);
  console.log(`GRAFANA_ANNOTATION ${EXPERIMENT_ID} START`);
  return metadata;
}

export default function () {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const params = {
    headers,
    timeout: REQUEST_TIMEOUT,
    tags: {
      experiment_id: EXPERIMENT_ID,
      scenario: SCENARIO,
    },
  };

  const flowStart = Date.now();

  // --- Create Order ---------------------------------------------------------
  const createRes = http.post(
    `${BASE_URL}/orders`,
    JSON.stringify({
      productId: PRODUCT_ID,
      quantity: 1,
    }),
    Object.assign({}, params, { tags: Object.assign({}, params.tags, { name: 'create_order' }) }),
  );

  let body = null;
  try {
    body = createRes.json();
  } catch (_) {
    body = null;
  }

  const createdOk = check(createRes, {
    'create status is 201': (r) => r.status === 201,
    'create returns order id': () =>
      body !== null && typeof body.id === 'string' && UUID_RE.test(body.id),
  });

  if (!createdOk || !body || !body.id) {
    orderCreationFailure.add(1);
    return;
  }
  orderCreationSuccess.add(1);

  const orderId = body.id;

  // --- Process Order --------------------------------------------------------
  const processRes = http.post(
    `${BASE_URL}/orders/${orderId}/process`,
    null,
    Object.assign({}, params, { tags: Object.assign({}, params.tags, { name: 'process_order' }) }),
  );

  let processBody = null;
  try {
    processBody = processRes.json();
  } catch (_) {
    processBody = null;
  }

  const processedOk = check(processRes, {
    'process status is 200': (r) => r.status === 200,
    'process status field is PAID': () =>
      processBody !== null && processBody.status === 'PAID',
  });

  if (!processedOk) {
    orderProcessingFailure.add(1);
    return;
  }
  orderProcessingSuccess.add(1);

  orderFlowDuration.add(Date.now() - flowStart);
}

export function teardown(data) {
  console.log(`GRAFANA_ANNOTATION ${EXPERIMENT_ID} END`);
  console.log(
    `EXPERIMENT_TEARDOWN ${JSON.stringify({
      experiment_id: EXPERIMENT_ID,
      ended_at_utc: new Date().toISOString(),
      setup: data,
    })}`,
  );
}

export function handleSummary(data) {
  const summaryPath = `${OUT_DIR}/summary.json`;
  let loadGenerator = null;
  if (__ENV.LOAD_GENERATOR_JSON) {
    try {
      loadGenerator = JSON.parse(__ENV.LOAD_GENERATOR_JSON);
    } catch (_) {
      loadGenerator = { parse_error: true, raw: __ENV.LOAD_GENERATOR_JSON };
    }
  }
  const payload = {
    experiment_id: EXPERIMENT_ID,
    scenario: SCENARIO,
    generated_at_utc: new Date().toISOString(),
    config: {
      base_url: BASE_URL,
      rate: RATE,
      duration: DURATION,
      pre_allocated_vus: PRE_ALLOCATED_VUS,
      max_vus: MAX_VUS,
      request_timeout: REQUEST_TIMEOUT,
      order_service_image: ORDER_SERVICE_IMAGE,
      payment_service_image: PAYMENT_SERVICE_IMAGE,
    },
    ...(loadGenerator ? { load_generator: loadGenerator } : {}),
    k6_summary: data,
  };

  return {
    [summaryPath]: JSON.stringify(payload, null, 2),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
