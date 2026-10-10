import type { CrewMemberSpecialtyDto } from '@streets/shared';

const THUG_FIRST = ['Mack', 'Duke', 'Jesse', 'Ray', 'Leon', 'Curtis', 'Eddie', 'Frankie', 'Lou', 'Rico', 'Benny', 'Andre', 'Marvin', 'Troy', 'Cal', 'Reggie'] as const;
const THUG_LAST = ['Cole', 'Mercer', 'Hayes', 'Bishop', 'Vega', 'Banks', 'Parker', 'Cruz', 'Dawson', 'Reed', 'Price', 'Monroe', 'Holland', 'Foster', 'James', 'Wells'] as const;
const WORKER_FIRST = ['Nina', 'Renee', 'Tasha', 'Marlene', 'Dani', 'Yvette', 'Maya', 'Simone', 'Vera', 'Jackie', 'Lena', 'Carmen', 'Toni', 'Jo', 'Roxie', 'Mina'] as const;
const WORKER_LAST = ['Monroe', 'Ellis', 'Grant', 'Bennett', 'Reed', 'Brooks', 'Taylor', 'Santos', 'Warren', 'Hayes', 'Mitchell', 'Parker', 'Banks', 'Cole', 'Price', 'Dawson'] as const;

export const CREW_BASELINE_TRAITS = ['Steady', 'Observant', 'Streetwise', 'Dependable', 'Cool under pressure', 'Quick learner'] as const;

/** Stable, server-generated identity for a round member. Names never depend on request order. */
export function crewMemberName(role: 'THUG' | 'WORKER', serial: number): string {
  const first = role === 'THUG' ? THUG_FIRST : WORKER_FIRST;
  const last = role === 'THUG' ? THUG_LAST : WORKER_LAST;
  const poolSize = first.length * last.length;
  const index = Math.max(0, serial - 1);
  const coreName = `${first[index % first.length]} ${last[Math.floor(index / first.length) % last.length]}`;
  const cycle = Math.floor(index / poolSize);
  return cycle ? `${coreName} ${cycle + 1}` : coreName;
}

/** Descriptive only in 1.7.0-B; no trait is allowed to modify a game outcome yet. */
export function crewMemberTraits(role: 'THUG' | 'WORKER', serial: number): string[] {
  const index = Math.max(0, serial - 1);
  const offset = role === 'THUG' ? 0 : 3;
  return [CREW_BASELINE_TRAITS[(index * 5 + offset) % CREW_BASELINE_TRAITS.length]!];
}

export function crewMemberSpecialty(dealerStaffId: string | null, specialty: CrewMemberSpecialtyDto): CrewMemberSpecialtyDto {
  return dealerStaffId ? 'DEALER' : specialty;
}
