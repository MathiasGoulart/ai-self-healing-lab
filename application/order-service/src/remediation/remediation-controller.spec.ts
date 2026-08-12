import { RemediationController } from './remediation-controller';
import {
  E002_FIXED_TIMEOUT_MS,
  RemediationBoundsError,
  TMAX_MS,
  TMIN_MS,
} from './remediation-types';

describe('RemediationController', () => {
  let metricsCalls: Array<Record<string, unknown>>;
  let logCalls: Array<Record<string, unknown>>;
  let controller: RemediationController;

  beforeEach(() => {
    metricsCalls = [];
    logCalls = [];
    controller = new RemediationController(
      {
        setPaymentTimeoutActive: (active, timeoutMs) => {
          metricsCalls.push({
            op: 'setPaymentTimeoutActive',
            active,
            timeoutMs,
          });
        },
        recordLifecycle: (action, timeoutMs) => {
          metricsCalls.push({ op: 'recordLifecycle', action, timeoutMs });
        },
      },
      (_level, event, fields = {}) => {
        logCalls.push({ event, ...fields });
      },
    );
  });

  it('is disabled by default', () => {
    const state = controller.getPaymentTimeoutState();
    expect(state.enabled).toBe(false);
    expect(state.timeout_ms).toBeNull();
    expect(state.activated_at).toBeNull();
    expect(controller.getActivePaymentTimeoutMs()).toBeNull();
  });

  it.each([TMIN_MS, E002_FIXED_TIMEOUT_MS, TMAX_MS])(
    'activates timeout_ms=%s within bounds',
    (timeoutMs) => {
      const result = controller.setPaymentTimeout(timeoutMs);
      expect(result.status).toBe('activated');
      expect(result.state.enabled).toBe(true);
      expect(result.state.timeout_ms).toBe(timeoutMs);
      expect(result.state.activated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(controller.getActivePaymentTimeoutMs()).toBe(timeoutMs);

      expect(metricsCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            op: 'setPaymentTimeoutActive',
            active: true,
            timeoutMs,
          }),
          expect.objectContaining({
            op: 'recordLifecycle',
            action: 'activate',
            timeoutMs,
          }),
        ]),
      );
      expect(logCalls).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            event: 'remediation',
            action: 'activate',
            remediation: 'payment_timeout',
            timeout_ms: timeoutMs,
          }),
        ]),
      );
    },
  );

  it.each([TMIN_MS - 1, TMAX_MS + 1, 1, 500, 200.5])(
    'rejects out-of-bounds timeout_ms=%s',
    (timeoutMs) => {
      expect(() => controller.setPaymentTimeout(timeoutMs as number)).toThrow(
        RemediationBoundsError,
      );
      expect(controller.getPaymentTimeoutState().enabled).toBe(false);
      expect(metricsCalls).toHaveLength(0);
    },
  );

  it('returns already_active for same timeout', () => {
    controller.setPaymentTimeout(E002_FIXED_TIMEOUT_MS);
    metricsCalls = [];
    logCalls = [];
    const result = controller.setPaymentTimeout(E002_FIXED_TIMEOUT_MS);
    expect(result.status).toBe('already_active');
    expect(metricsCalls).toHaveLength(0);
    expect(logCalls).toHaveLength(0);
  });

  it('updates timeout in place within bounds', () => {
    controller.setPaymentTimeout(E002_FIXED_TIMEOUT_MS);
    const firstActivatedAt = controller.getPaymentTimeoutState().activated_at;
    metricsCalls = [];
    const result = controller.setPaymentTimeout(TMAX_MS);
    expect(result.status).toBe('updated');
    expect(result.state.timeout_ms).toBe(TMAX_MS);
    expect(result.state.activated_at).toBe(firstActivatedAt);
    expect(metricsCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: 'recordLifecycle',
          action: 'update',
          timeoutMs: TMAX_MS,
        }),
      ]),
    );
  });

  it('clears an active timeout', () => {
    controller.setPaymentTimeout(E002_FIXED_TIMEOUT_MS);
    metricsCalls = [];
    const result = controller.clearPaymentTimeout();
    expect(result.status).toBe('deactivated');
    expect(result.state.enabled).toBe(false);
    expect(result.state.timeout_ms).toBeNull();
    expect(controller.getActivePaymentTimeoutMs()).toBeNull();
    expect(metricsCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: 'setPaymentTimeoutActive',
          active: false,
          timeoutMs: null,
        }),
        expect.objectContaining({
          op: 'recordLifecycle',
          action: 'deactivate',
          timeoutMs: E002_FIXED_TIMEOUT_MS,
        }),
      ]),
    );
  });

  it('clear when inactive returns not_active', () => {
    const result = controller.clearPaymentTimeout();
    expect(result.status).toBe('not_active');
  });
});
