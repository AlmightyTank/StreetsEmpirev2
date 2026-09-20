import type { Prisma, PrismaClient } from '@prisma/client';
import {
  armEscorts,
  cargoUnits,
  cornerMinimumFor,
  equipCombatSquad,
  runCapacity,
  runPosition,
  type Rng,
  type Ruleset,
} from '@streets/rules-engine';
import type { DistrictKey } from '@streets/rulesets';
import type {
  RunOutpostEstablishInput,
  RunOutpostEstablishResult,
  RunOutpostTransferInput,
  RunOutpostTransferResult,
} from '@streets/shared';
import { AppError } from '../utils/errors.js';
import { ActionService, assertTurns } from './action.service.js';
import { productKeys } from './product-inventory.service.js';
import { RUN_INCLUDE, cargoOf, toStopPlans, totalAwayWorth, type LoadedRun } from './run-settle.service.js';
import {
  TurfService,
  cornerGunWorthCents,
  localsOnBlock,
  outpostBoxWorthCents,
  turfGunData,
  type CornerGuns,
} from './turf.service.js';
import { recordTerritoryControlChange, territoryControlForCity } from './turf-territory.service.js';

function requireOutposts(ruleset: Ruleset) {
  const rules = ruleset.turf?.outposts;
  if (!rules) throw AppError.conflict('OUTPOSTS_DISABLED', 'Away turf is not open in this round.');
  return rules;
}

function districtName(ruleset: Ruleset, city: string, district: DistrictKey): string {
  return ruleset.cities?.[city]?.districts?.[district]?.name ?? ruleset.districts[district].name;
}

function engineGuns(guns: CornerGuns) {
  return { PISTOL: guns.pistols, SHOTGUN: guns.shotguns, TEK9: guns.tek9s, AK47: guns.ak47s };
}

function localsGuns(ruleset: Ruleset, locals: number) {
  const guns = { PISTOL: 0, SHOTGUN: 0, TEK9: 0, AK47: 0 };
  guns[ruleset.turf!.locals.weapon] = Math.min(locals, Math.ceil(locals * ruleset.turf!.locals.armedShare));
  return guns;
}

function gunCount(guns: CornerGuns): number {
  return guns.pistols + guns.shotguns + guns.tek9s + guns.ak47s;
}

function runGuns(run: LoadedRun): CornerGuns {
  return { pistols: run.pistols, shotguns: run.shotguns, tek9s: run.tek9s, ak47s: run.ak47s };
}

function subtractGuns(a: CornerGuns, b: CornerGuns): CornerGuns {
  return {
    pistols: a.pistols - b.pistols,
    shotguns: a.shotguns - b.shotguns,
    tek9s: a.tek9s - b.tek9s,
    ak47s: a.ak47s - b.ak47s,
  };
}

function positiveProducts(input: Record<string, number>, allowed: readonly string[]): Record<string, number> {
  const valid = new Set(allowed);
  const out: Record<string, number> = {};
  for (const [key, quantity] of Object.entries(input)) {
    if (!valid.has(key)) throw AppError.badRequest('UNKNOWN_PRODUCT', 'That product is not part of this round.');
    if (quantity > 0) out[key] = quantity;
  }
  return out;
}

function productUnits(products: Record<string, number>): number {
  return Object.values(products).reduce((sum, quantity) => sum + quantity, 0);
}

async function activeRunInTown(tx: any, roundPlayerId: string, ruleset: Ruleset, now: Date, runId?: string): Promise<{ run: LoadedRun; city: string }> {
  if (!runId) {
    const count = await tx.run.count({ where: { roundPlayerId, status: 'ACTIVE' } });
    if (count > 1) throw AppError.badRequest('RUN_PICK_REQUIRED', 'Pick which run is servicing the outpost.');
  }
  const run = runId
    ? await tx.run.findUnique({ where: { id: runId }, include: RUN_INCLUDE })
    : await tx.run.findFirst({ where: { roundPlayerId, status: 'ACTIVE' }, include: RUN_INCLUDE, orderBy: [{ launchedAt: 'asc' }, { id: 'asc' }] });
  if (!run || run.roundPlayerId !== roundPlayerId || run.status !== 'ACTIVE') throw AppError.conflict('NO_RUN', 'That active run is not available.');
  const position = runPosition(ruleset, toStopPlans(run.stops), now);
  if (position.phase !== 'town') {
    throw AppError.conflict('NOT_IN_TOWN', position.phase === 'road' ? 'The run is still on the road.' : 'The run is already home.');
  }
  return { run, city: position.city };
}

async function lockBlock(tx: any, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Turf" WHERE id = ${id} FOR UPDATE`;
}
async function lockOutpost(tx: any, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "TurfOutpost" WHERE id = ${id} FOR UPDATE`;
}

async function writeCargo(tx: any, runId: string, cargo: Record<string, number>): Promise<void> {
  for (const [productKey, quantity] of Object.entries(cargo)) {
    await tx.runCargo.update({ where: { runId_productKey: { runId, productKey } }, data: { quantity } });
  }
}

function applyProducts(base: Record<string, number>, moved: Record<string, number>, direction: 1 | -1): Record<string, number> {
  const out = { ...base };
  for (const [key, quantity] of Object.entries(moved)) out[key] = (out[key] ?? 0) + direction * quantity;
  return out;
}

export const TurfOutpostService = {
  establish(prisma: PrismaClient, roundPlayerId: string, input: RunOutpostEstablishInput, rng: Rng = Math.random) {
    return ActionService.run<RunOutpostEstablishResult>(prisma, roundPlayerId, {
      action: 'TURF_OUTPOST_ESTABLISH',
      actionId: input.actionId,
      execute: async ({ tx, current, thugHappiness, player, round, ruleset, now }) => {
        const outpostRules = requireOutposts(ruleset);
        await TurfService.ensureRound(tx, round.id, ruleset);
        const { run, city: citySlug } = await activeRunInTown(tx, roundPlayerId, ruleset, now, input.runId);
        if (citySlug === player.city.slug) throw AppError.conflict('OUTPOST_AT_HOME', 'Home turf is not an outpost.');

        const city = await tx.city.findUniqueOrThrow({ where: { slug: citySlug } });
        const key = input.district as DistrictKey;
        if (!ruleset.turf!.districts[key]) throw AppError.badRequest('UNKNOWN_DISTRICT', 'That is not a turf block.');

        const block = await tx.turf.findUnique({
          where: { roundId_cityId_district: { roundId: round.id, cityId: city.id, district: key } },
          include: { city: { select: { slug: true } } },
        });
        if (!block) throw AppError.notFound('TURF_NOT_FOUND', 'That block is not on the map.');
        await lockBlock(tx, block.id);
        const fresh = await tx.turf.findUniqueOrThrow({
          where: { id: block.id },
          include: { city: { select: { slug: true } }, outpost: true },
        });
        if (fresh.holderId) throw AppError.conflict('TURF_HELD', 'A crew already holds that block.');
        if (fresh.outpost) throw AppError.conflict('OUTPOST_EXISTS', 'That block already has an outpost box.');

        const [heldAway, allianceHeld, presence] = await Promise.all([
          tx.turf.count({ where: { roundId: round.id, holderId: roundPlayerId, cityId: { not: player.cityId } } }),
          player.allianceId
            ? tx.turf.count({ where: { roundId: round.id, cityId: city.id, holder: { allianceId: player.allianceId } } })
            : 0,
          TurfService.presenceFor(tx, roundPlayerId, city.id, key, ruleset, now),
        ]);
        if (heldAway >= ruleset.turf!.caps.blocksPerCrewAway) {
          throw AppError.conflict('TURF_AWAY_CAP', `You already hold your ${ruleset.turf!.caps.blocksPerCrewAway}-block away cap.`);
        }
        if (player.allianceId && allianceHeld >= ruleset.turf!.caps.blocksPerAllianceInCity) {
          throw AppError.conflict('TURF_ALLIANCE_CAP', `Your alliance already holds ${ruleset.turf!.caps.blocksPerAllianceInCity} blocks here.`);
        }
        if (presence < ruleset.turf!.presence.turnsToClaim) {
          throw AppError.conflict('TURF_NO_PRESENCE', `You need ${ruleset.turf!.presence.turnsToClaim} presence here before the run can establish an outpost.`);
        }

        const crewThugs = current.thugs + run.escortThugs;
        const minimum = cornerMinimumFor(ruleset, key, crewThugs);
        const fitEscorts = Math.max(0, run.escortThugs - run.woundedEscorts);
        if (input.thugs < minimum) throw AppError.badRequest('TURF_SQUAD_SMALL', `This corner needs at least ${minimum} thugs.`);
        if (input.thugs > fitEscorts) throw AppError.conflict('OUTPOST_NOT_ENOUGH_ESCORTS', `Only ${fitEscorts} fit escorts can stay behind.`);

        const guns = armEscorts(ruleset, input.thugs, run);
        if (gunCount(guns) < input.thugs) throw AppError.conflict('OUTPOST_NOT_ENOUGH_GUNS', `The run needs ${input.thugs} guns for the crew staying behind.`);

        const products = positiveProducts(input.products, productKeys(ruleset));
        const cargo = cargoOf(run);
        for (const [keyName, quantity] of Object.entries(products)) {
          if (quantity > (cargo[keyName] ?? 0)) throw AppError.badRequest('OUTPOST_NOT_ENOUGH_PRODUCT', `The run only carries ${cargo[keyName] ?? 0} ${keyName}.`);
        }
        if (BigInt(input.cashCents) > run.cashCents) throw AppError.badRequest('OUTPOST_NOT_ENOUGH_CASH', 'The run does not carry that much cash.');
        if (input.beer > run.beer) throw AppError.badRequest('OUTPOST_NOT_ENOUGH_BEER', `The run only carries ${run.beer} beer.`);
        if (input.cashCents > outpostRules.cashCapCents) throw AppError.badRequest('OUTPOST_CASH_CAP', `The outpost box holds at most $${(outpostRules.cashCapCents / 100).toLocaleString('en-US')}.`);
        if (input.beer > outpostRules.beerCap) throw AppError.badRequest('OUTPOST_BEER_CAP', `The outpost box holds at most ${outpostRules.beerCap} beer.`);
        if (productUnits(products) > outpostRules.productCap) throw AppError.badRequest('OUTPOST_PRODUCT_CAP', `The outpost box holds at most ${outpostRules.productCap} product units.`);

        const turnsUsed = ruleset.turf!.corner.postTurnCost + outpostRules.transferTurnCost;
        assertTurns(current.turns, turnsUsed);

        const locals = localsOnBlock(ruleset, {
          holderId: fresh.holderId,
          citySlug,
          district: key,
          localsThugs: fresh.localsThugs,
          localsAt: fresh.localsAt,
          localsReclaimAt: fresh.localsReclaimAt,
        }, now);
        const model = ruleset.combat;
        if (!model) throw AppError.conflict('COMBAT_DISABLED', 'There is no street fight model in this round.');
        const attacker = equipCombatSquad({ thugs: input.thugs, thugHappiness, weapons: engineGuns(guns) }, Math.min(input.thugs, model.squadCap), model);
        const defender = equipCombatSquad({ thugs: locals, thugHappiness: 100, weapons: localsGuns(ruleset, locals) }, Math.min(locals, model.squadCap), model);
        const variance = ruleset.turf!.push.fight.variance;
        const attackerStrength = attacker.strength * (1 + (rng() * 2 - 1) * variance);
        const defenderStrength = defender.strength * ruleset.turf!.push.fight.defenseMultiplier;
        const won = attackerStrength > defenderStrength;

        const name = districtName(ruleset, citySlug, key);
        if (!won) {
          return {
            next: { ...current, turns: current.turns - turnsUsed },
            result: {
              outpostId: '', city: citySlug, cityName: ruleset.cities?.[citySlug]?.name ?? citySlug,
              district: key, districtName: name, won: false, squad: input.thugs, localsThugs: locals,
              cornerThugs: 0, cashCents: 0, beer: 0, products: {}, turnsUsed,
            },
            activity: { type: 'TURF_OUTPOST_ESTABLISH', payload: {
              city: citySlug, district: key, won: false, thugs: input.thugs, locals,
              attackerStrength: Math.round(attackerStrength * 10) / 10,
              defenderStrength: Math.round(defenderStrength * 10) / 10,
            } as Prisma.InputJsonValue },
          };
        }

        const controlBefore = await territoryControlForCity(tx, round.id, city.id, ruleset);
        const remainingGuns = subtractGuns(runGuns(run), guns);
        const remainingCargo = applyProducts(cargo, products, -1);
        const runCash = run.cashCents - BigInt(input.cashCents);
        const runBeer = run.beer - input.beer;
        const runEscorts = run.escortThugs - input.thugs;

        await tx.turf.update({
          where: { id: fresh.id },
          data: {
            holderId: roundPlayerId, cornerThugs: input.thugs, ...turfGunData(guns), heldSince: now,
            shieldUntil: null, upkeepAt: now, localsThugs: locals, localsAt: now, localsReclaimAt: null,
          },
        });
        const outpost = await tx.turfOutpost.create({
          data: {
            turfId: fresh.id,
            ownerId: roundPlayerId,
            cashCents: BigInt(input.cashCents),
            beer: input.beer,
            products: products as Prisma.InputJsonValue,
          },
        });
        await recordTerritoryControlChange(tx, {
          roundId: round.id, cityId: city.id, ruleset, before: controlBefore, at: now,
        });
        await writeCargo(tx, run.id, remainingCargo);
        await tx.run.update({
          where: { id: run.id },
          data: {
            escortThugs: runEscorts,
            cashCents: runCash,
            beer: runBeer,
            pistols: remainingGuns.pistols,
            shotguns: remainingGuns.shotguns,
            tek9s: remainingGuns.tek9s,
            ak47s: remainingGuns.ak47s,
          },
        });

        const seedWorth = outpostBoxWorthCents(ruleset, { cashCents: BigInt(input.cashCents), beer: input.beer, products });
        const postedWorth = cornerGunWorthCents(ruleset, guns);
        const newAway = await totalAwayWorth(tx, roundPlayerId, ruleset);

        return {
          next: {
            ...current,
            turns: current.turns - turnsUsed,
            thugs: current.thugs + input.thugs,
            postedThugs: current.postedThugs + input.thugs,
            postedNetWorthCents: current.postedNetWorthCents + postedWorth,
            outpostNetWorthCents: current.outpostNetWorthCents + seedWorth,
            awayNetWorthCents: newAway,
          },
          result: {
            outpostId: outpost.id, city: citySlug, cityName: ruleset.cities?.[citySlug]?.name ?? citySlug,
            district: key, districtName: name, won: true, squad: input.thugs, localsThugs: locals,
            cornerThugs: input.thugs, cashCents: input.cashCents, beer: input.beer, products, turnsUsed,
          },
          activity: { type: 'TURF_OUTPOST_ESTABLISH', payload: {
            outpostId: outpost.id, city: citySlug, district: key, won: true, thugs: input.thugs,
            cashCents: input.cashCents, beer: input.beer, products,
          } as Prisma.InputJsonValue },
        };
      },
    });
  },

  transfer(prisma: PrismaClient, roundPlayerId: string, input: RunOutpostTransferInput) {
    return ActionService.run<RunOutpostTransferResult>(prisma, roundPlayerId, {
      action: 'TURF_OUTPOST_TRANSFER',
      actionId: input.actionId,
      execute: async ({ tx, current, player, ruleset, now }) => {
        const outpostRules = requireOutposts(ruleset);
        const { run, city: citySlug } = await activeRunInTown(tx, roundPlayerId, ruleset, now, input.runId);
        if (citySlug === player.city.slug) throw AppError.conflict('OUTPOST_AT_HOME', 'There is no away outpost to service at home.');
        const city = await tx.city.findUniqueOrThrow({ where: { slug: citySlug } });
        const key = input.district as DistrictKey;
        const turf = await tx.turf.findUnique({
          where: { roundId_cityId_district: { roundId: player.roundId, cityId: city.id, district: key } },
          include: { outpost: true },
        });
        if (!turf || turf.holderId !== roundPlayerId || !turf.outpost) {
          throw AppError.conflict('OUTPOST_NOT_OWNED', 'You do not have an outpost on that block.');
        }
        await lockOutpost(tx, turf.outpost.id);
        const box = await tx.turfOutpost.findUniqueOrThrow({ where: { id: turf.outpost.id } });

        const moved = positiveProducts(input.products, productKeys(ruleset));
        const boxProducts = { ...(box.products as Record<string, number>) };
        const runCargo = cargoOf(run);
        const cash = BigInt(input.cashCents);

        let nextBoxCash = box.cashCents;
        let nextBoxBeer = box.beer;
        let nextBoxProducts = { ...boxProducts };
        let nextRunCash = run.cashCents;
        let nextRunBeer = run.beer;
        let nextRunCargo = { ...runCargo };

        if (input.direction === 'deposit') {
          if (cash > run.cashCents) throw AppError.badRequest('OUTPOST_NOT_ENOUGH_CASH', 'The run does not carry that much cash.');
          if (input.beer > run.beer) throw AppError.badRequest('OUTPOST_NOT_ENOUGH_BEER', `The run only carries ${run.beer} beer.`);
          for (const [product, quantity] of Object.entries(moved)) {
            if (quantity > (runCargo[product] ?? 0)) throw AppError.badRequest('OUTPOST_NOT_ENOUGH_PRODUCT', `The run only carries ${runCargo[product] ?? 0} ${product}.`);
          }
          nextBoxCash += cash;
          nextBoxBeer += input.beer;
          nextBoxProducts = applyProducts(boxProducts, moved, 1);
          if (nextBoxCash > BigInt(outpostRules.cashCapCents)) throw AppError.conflict('OUTPOST_CASH_CAP', 'The outpost cash box is full.');
          if (nextBoxBeer > outpostRules.beerCap) throw AppError.conflict('OUTPOST_BEER_CAP', 'The outpost beer stock is full.');
          if (productUnits(nextBoxProducts) > outpostRules.productCap) throw AppError.conflict('OUTPOST_PRODUCT_CAP', 'The outpost product box is full.');
          nextRunCash -= cash;
          nextRunBeer -= input.beer;
          nextRunCargo = applyProducts(runCargo, moved, -1);
        } else {
          if (cash > box.cashCents) throw AppError.badRequest('OUTPOST_NOT_ENOUGH_CASH', 'The outpost does not hold that much cash.');
          if (input.beer > box.beer) throw AppError.badRequest('OUTPOST_NOT_ENOUGH_BEER', `The outpost only holds ${box.beer} beer.`);
          for (const [product, quantity] of Object.entries(moved)) {
            if (quantity > (boxProducts[product] ?? 0)) throw AppError.badRequest('OUTPOST_NOT_ENOUGH_PRODUCT', `The outpost only holds ${boxProducts[product] ?? 0} ${product}.`);
          }
          const roomNeeded = input.beer + productUnits(moved);
          const runUsed = run.beer + cargoUnits(runCargo);
          if (runUsed + roomNeeded > runCapacity(ruleset, run.lowRiders)) {
            throw AppError.conflict('TRUNK_FULL', 'The run does not have enough room for that pickup.');
          }
          nextBoxCash -= cash;
          nextBoxBeer -= input.beer;
          nextBoxProducts = applyProducts(boxProducts, moved, -1);
          nextRunCash += cash;
          nextRunBeer += input.beer;
          nextRunCargo = applyProducts(runCargo, moved, 1);
        }

        assertTurns(current.turns, outpostRules.transferTurnCost);
        const oldWorth = outpostBoxWorthCents(ruleset, { cashCents: box.cashCents, beer: box.beer, products: boxProducts });
        const newWorth = outpostBoxWorthCents(ruleset, { cashCents: nextBoxCash, beer: nextBoxBeer, products: nextBoxProducts });

        await tx.turfOutpost.update({
          where: { id: box.id },
          data: { cashCents: nextBoxCash, beer: nextBoxBeer, products: nextBoxProducts as Prisma.InputJsonValue },
        });
        for (const product of Object.keys(nextRunCargo)) {
          const quantity = nextRunCargo[product] ?? 0;
          await tx.runCargo.upsert({
            where: { runId_productKey: { runId: run.id, productKey: product } },
            create: { runId: run.id, productKey: product, quantity, startQuantity: 0 },
            update: { quantity },
          });
        }
        await tx.run.update({ where: { id: run.id }, data: { cashCents: nextRunCash, beer: nextRunBeer } });

        const newAway = await totalAwayWorth(tx, roundPlayerId, ruleset);
        const outpostNetWorthCents = current.outpostNetWorthCents + (newWorth - oldWorth);
        if (outpostNetWorthCents < 0n) throw new RangeError('Outpost net worth fell below zero.');

        const result: RunOutpostTransferResult = {
          outpostId: box.id,
          city: citySlug,
          cityName: ruleset.cities?.[citySlug]?.name ?? citySlug,
          district: key,
          districtName: districtName(ruleset, citySlug, key),
          direction: input.direction,
          cashCents: input.cashCents,
          beer: input.beer,
          products: moved,
          box: { cashCents: Number(nextBoxCash), beer: nextBoxBeer, products: nextBoxProducts },
          runCashCents: Number(nextRunCash),
          runBeer: nextRunBeer,
          runCargo: nextRunCargo,
          turnsUsed: outpostRules.transferTurnCost,
        };
        return {
          next: {
            ...current,
            turns: current.turns - outpostRules.transferTurnCost,
            awayNetWorthCents: newAway,
            outpostNetWorthCents,
          },
          result,
          activity: { type: 'TURF_OUTPOST_TRANSFER', payload: result as unknown as Prisma.InputJsonValue },
        };
      },
    });
  },
};
