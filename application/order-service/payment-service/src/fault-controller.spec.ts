import { FaultController } from './fault-controller';
import { FaultSeverity, PAYMENT_LATENCY_MS } from './fault-types';

describe('FaultController', () => {
  let metricsCalls: Array<Record<string, unknown>>;
  let logCalls: Array<Record<string, unknown>>;
  let controller: FaultController;

  beforeEach(() => {
    metricsCalls = [];
    logCalls = [];
    controller = new FaultController(
      {
        setActive: (fault, severity, active) => {
          metricsCalls.push({ op: 'setActive', fault, severity, active });
        },
        recordLifecycle: (fault, severity, action) => {
          metricsCalls.push({ op: 'recordLifecycle', fault, severity, action });
        },
      },
      (_level, event, fields = {}) => {
        logCalls.push({ event, ...fields });
      },
    );
  });

  it('has no active fault by default', () => {
    const state = controller.getState();
    expect(state.active).toBe(false);
    expect(state.severity).toBeNull();
    expect(state.parameter_ms).toBeNull();
    expect(state.activated_at).toBeNull();
    expect(controller.getPaymentLatencyMs()).toBe(0);
  });

  it.each<[FaultSeverity, number]>([
    ['low', 500],
    ['medium', 2000],
    ['high', 5000],
  ])('activates %s → %dms', (severity, ms) => {
    const result = controller.activate('payment_latency', severity);
    expect(result.status).toBe('activated');
    expect(result.state.active).toBe(true);
    expect(result.state.severity).toBe(severity);
    expect(result.state.parameter_ms).toBe(ms);
    expect(result.state.activated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(controller.getPaymentLatencyMs()).toBe(ms);
    expect(PAYMENT_LATENCY_MS[severity]).toBe(ms);

    expect(logCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'fault_injection',
          action: 'activate',
          fault: 'payment_latency',
          severity,
          parameter_ms: ms,
        }),
      ]),
    );
  });

  it('deactivate clears fault state', () => {
    controller.activate('payment_latency', 'medium');
    const result = controller.deactivate('payment_latency');
    expect(result.status).toBe('deactivated');
    expect(result.state.active).toBe(false);
    expect(controller.getPaymentLatencyMs()).toBe(0);
    expect(controller.getLastDeactivatedAt()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(logCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'fault_injection',
          action: 'deactivate',
          severity: 'medium',
          parameter_ms: 2000,
        }),
      ]),
    );
  });

  it('duplicate activation returns already_active without stacking', () => {
    controller.activate('payment_latency', 'medium');
    metricsCalls.length = 0;
    logCalls.length = 0;
    const result = controller.activate('payment_latency', 'medium');
    expect(result.status).toBe('already_active');
    expect(controller.getPaymentLatencyMs()).toBe(2000);
    expect(metricsCalls).toHaveLength(0);
    expect(logCalls).toHaveLength(0);
  });

  it('severity update replaces delay (medium → high)', () => {
    controller.activate('payment_latency', 'medium');
    const result = controller.activate('payment_latency', 'high');
    expect(result.status).toBe('updated');
    expect(result.state.severity).toBe('high');
    expect(controller.getPaymentLatencyMs()).toBe(5000);
    expect(metricsCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          op: 'setActive',
          severity: 'medium',
          active: false,
        }),
        expect.objectContaining({
          op: 'setActive',
          severity: 'high',
          active: true,
        }),
      ]),
    );
  });

  it('deactivate when inactive returns not_active', () => {
    const result = controller.deactivate('payment_latency');
    expect(result.status).toBe('not_active');
  });
});
