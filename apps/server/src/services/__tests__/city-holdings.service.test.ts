import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { classicOgV18S, classicOgV30A } from '@streets/rulesets';
import { CityHoldingsService, reconciledHoldingModifiers } from '../city-holdings.service.js';

describe('city holdings read gate', () => {
  it('never reads or builds a holding for a historical round', async () => {
    const db = { turf: { findMany: vi.fn() } } as unknown as PrismaClient;
    expect(await CityHoldingsService.read(db, classicOgV18S, 'old', 'player')).toBeNull();
    expect(db.turf.findMany).not.toHaveBeenCalled();
  });

  it('reads existing records without writing or multiplying values', async () => {
    const db = {
      turf: { findMany: vi.fn().mockResolvedValue([
        { city: { slug: 'san-francisco' }, district: 'CASINO', businesses: [{ level: 1, staff: 2 }, { level: 0, staff: 0 }] },
      ]) },
       supplyWarehouse: { findMany: vi.fn().mockResolvedValue([{ id: 'stash', citySlug: 'san-francisco', name: 'Home stash', kind: 'STASH', isActive: true, paidThrough: null, upkeepCents: 0n, capacityUnits: 100, stock: [{ productKey: 'WEED', quantity: 12 }] }]) },
       supplySafehouse: { findMany: vi.fn().mockResolvedValue([]) },
       dealerCrew: { findMany: vi.fn().mockResolvedValue([{ id: 'crew', citySlug: 'san-francisco', districtKey: 'CASINO', status: 'ACTIVE', inventory: [{ productKey: 'WEED', quantity: 3 }] }]) },
       supplyPickup: { findMany: vi.fn().mockResolvedValue([{ id: 'incoming', destinationCitySlug: 'san-francisco', warehouseId: 'stash', productKey: 'WEED', quantity: 5, status: 'IN_TRANSIT' }]) },
       playerCase: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    const result = await CityHoldingsService.read(db, classicOgV30A, 'round', 'player');
    expect(result?.cities).toEqual([expect.objectContaining({
      citySlug: 'san-francisco', corners: ['CASINO'], fronts: 1,
       warehouses: [expect.objectContaining({ id: 'stash', kind: 'STASH', upkeepDue: false, stock: [{ productKey: 'WEED', quantity: 12 }] })],
       crews: [expect.objectContaining({ stock: [{ productKey: 'WEED', quantity: 3 }] })],
       inbound: [expect.objectContaining({ quantity: 5 })], pressure: { casePoints: 0, stage: 'QUIET' },
    })]);
    expect(result?.modifiers).toEqual({ dealerSalesPace: 1, demand: 1, upkeep: 1 });
    expect(db.turf.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { roundId: 'round', holderId: 'player' } }));
    expect(result?.cities[0]?.warehouses[0]?.stock[0]?.quantity).toBe(12);
    expect(result?.cities[0]?.crews[0]?.stock[0]?.quantity).toBe(3);
    expect(Object.values(db).every((model) => Object.keys(model).every((operation) => operation === 'findMany'))).toBe(true);
  });

  it('reflects upkeep and case pressure on repeat and concurrent reads without any writes', async () => {
    const now = new Date('2026-10-14T12:00:00Z');
    const db = {
      turf: { findMany: vi.fn().mockResolvedValue([]) },
      supplyWarehouse: { findMany: vi.fn().mockResolvedValue([{ id: 'property', citySlug: 'seattle', name: 'Warehouse', kind: 'WAREHOUSE', isActive: true, paidThrough: now, upkeepCents: 300n, capacityUnits: 200, stock: [] }]) },
      supplySafehouse: { findMany: vi.fn().mockResolvedValue([{ citySlug: 'seattle', isActive: true, paidThrough: now, upkeepCents: 200n }]) },
      dealerCrew: { findMany: vi.fn().mockResolvedValue([]) },
      supplyPickup: { findMany: vi.fn().mockResolvedValue([]) },
      playerCase: { findMany: vi.fn().mockResolvedValue([{ city: { slug: 'seattle' }, caseHundredths: 500, caseAt: now, lastEvidenceAt: now }]) },
    } as unknown as PrismaClient;
    const [first, second] = await Promise.all([
      CityHoldingsService.read(db, classicOgV30A, 'round', 'player', now),
      CityHoldingsService.read(db, classicOgV30A, 'round', 'player', now),
    ]);
    expect(first).toEqual(second);
    expect(first?.cities).toHaveLength(1);
    expect(first?.cities[0]).toEqual(expect.objectContaining({
      warehouses: [expect.objectContaining({ upkeepDue: true, upkeepCents: '300' })],
      safehouses: [expect.objectContaining({ upkeepDue: true, footholdActive: false })],
      pressure: expect.objectContaining({ casePoints: 5 }),
    }));
    expect(Object.values(db).every((model) => Object.keys(model).every((operation) => operation === 'findMany'))).toBe(true);
  });

  it('reports bad source data and refuses non-identity holding modifiers on drift', async () => {
    const tuned = { dealerSalesPace: 1.08, demand: 1.03, upkeep: 0.98 };
    expect(reconciledHoldingModifiers(tuned, ['Duplicate corner: seattle:CASINO'])).toEqual({ dealerSalesPace: 1, demand: 1, upkeep: 1 });
    expect(reconciledHoldingModifiers(tuned, [])).toEqual(tuned);
    const db = {
      turf: { findMany: vi.fn().mockResolvedValue([
        { city: { slug: 'seattle' }, district: 'CASINO', businesses: [] },
        { city: { slug: 'seattle' }, district: 'CASINO', businesses: [] },
      ]) },
      supplyWarehouse: { findMany: vi.fn().mockResolvedValue([]) },
      supplySafehouse: { findMany: vi.fn().mockResolvedValue([]) },
      dealerCrew: { findMany: vi.fn().mockResolvedValue([]) },
      supplyPickup: { findMany: vi.fn().mockResolvedValue([]) },
      playerCase: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;
    const result = await CityHoldingsService.read(db, classicOgV30A, 'round', 'player');
    expect(result?.diagnostics).toEqual(['Duplicate corner: seattle:CASINO']);
    expect(result?.modifiers).toEqual({ dealerSalesPace: 1, demand: 1, upkeep: 1 });
  });
});
