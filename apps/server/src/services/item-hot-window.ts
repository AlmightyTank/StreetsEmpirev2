import { STREET_SKILLS_V2 } from '@streets/rulesets';
import type { Db } from '../utils/db.js';
import { PlayerSkillService } from './player-skill.service.js';

/** Resolve the 24h recovery window against the holder's Ghost and owner's Tripwire. */
export async function stolenItemHotUntil(db: Db, holderId: string, formerOwnerId: string, now: Date): Promise<Date> {
  const [holder, formerOwner] = await Promise.all([
    PlayerSkillService.effects(db, holderId, STREET_SKILLS_V2),
    PlayerSkillService.effects(db, formerOwnerId, STREET_SKILLS_V2),
  ]);
  const hours = 24 - (holder.has('GHOST') ? 12 : 0) + (formerOwner.has('TRIPWIRE') ? 12 : 0);
  return new Date(now.getTime() + hours * 60 * 60 * 1_000);
}
