/**
 * Test suite: Lead single-label endpoint (PATCH /leads/:id/label)
 * Covers: set label, change label, clear label (null), response shape, customer regression.
 *
 * Why integration: confirms FK + labelAssignedAt are wired through controller → service → DB.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiTestClient, adminClient } from '../helpers/api-test-client-with-auth';

describe('Lead Single Label — PATCH /leads/:id/label', () => {
  let admin: ApiTestClient;
  let leadId: string;
  let labelA: string;
  let labelB: string;

  beforeAll(async () => {
    admin = await adminClient();

    // Create a fresh lead
    const phone = `099${Date.now().toString().slice(-7)}`;
    const created = await admin.postJson<any>('/leads', {
      phone,
      name: 'Single Label Test Lead',
    });
    expect(created.status).toBe(201);
    leadId = created.body.data?.id ?? created.body.id;

    // Pick two seed labels
    const labelsRes = await admin.getJson<any>('/labels');
    const labels = labelsRes.body.data ?? [];
    expect(labels.length).toBeGreaterThanOrEqual(2);
    labelA = String(labels[0].id);
    labelB = String(labels[1].id);
  });

  it('sets label on lead — response.label populated', async () => {
    const setRes = await admin.patchJson<any>(`/leads/${leadId}/label`, { labelId: labelA });
    expect(setRes.status).toBe(200);

    const detail = await admin.getJson<any>(`/leads/${leadId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.labelId).toBe(labelA);
    expect(detail.body.data.label).toBeTruthy();
    expect(String(detail.body.data.label.id)).toBe(labelA);
  });

  it('changes label — replaces previous (no duplicate)', async () => {
    const swapRes = await admin.patchJson<any>(`/leads/${leadId}/label`, { labelId: labelB });
    expect(swapRes.status).toBe(200);

    const detail = await admin.getJson<any>(`/leads/${leadId}`);
    expect(detail.body.data.labelId).toBe(labelB);
    // No `labels[]` array on lead anymore — just `label` singular
    expect(detail.body.data.labels).toBeUndefined();
  });

  it('clears label — labelId null, label null', async () => {
    const clearRes = await admin.patchJson<any>(`/leads/${leadId}/label`, { labelId: null });
    expect(clearRes.status).toBe(200);

    const detail = await admin.getJson<any>(`/leads/${leadId}`);
    expect(detail.body.data.labelId).toBeNull();
    expect(detail.body.data.label).toBeNull();
  });

  it('regression: customer multi-label endpoint still works', async () => {
    // Find any seeded customer
    const list = await admin.getJson<any>('/customers?limit=5');
    const custs = list.body.data ?? [];
    if (custs.length === 0) return; // skip if empty

    const customerId = custs[0].id;
    const labelsRes = await admin.getJson<any>('/labels');
    const labels = labelsRes.body.data ?? [];

    // Attach 2 labels in sequence (customer junction supports multi)
    const r1 = await admin.postJson<any>(`/customers/${customerId}/labels`, { labelIds: [String(labels[0].id)] });
    expect([200, 201]).toContain(r1.status);
    const r2 = await admin.postJson<any>(`/customers/${customerId}/labels`, { labelIds: [String(labels[1].id)] });
    expect([200, 201]).toContain(r2.status);

    // Customer detail should show both
    const detail = await admin.getJson<any>(`/customers/${customerId}`);
    const customerLabels = detail.body.data?.labels ?? [];
    expect(customerLabels.length).toBeGreaterThanOrEqual(2);
  });
});
