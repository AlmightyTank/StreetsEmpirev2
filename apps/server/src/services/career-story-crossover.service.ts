import type { CareerStoryCrossoverDto } from '@streets/shared';

/** Convert optional source references into public-safe story cards. Raw source payloads never cross this boundary. */
export function careerStoryCrossover(input: { kind: CareerStoryCrossoverDto['kind']; sourceId: string; label: string; ownerVisible: boolean; publicVisible: boolean }): CareerStoryCrossoverDto {
  const available = input.ownerVisible || input.publicVisible;
  return { kind: input.kind, sourceId: available ? input.sourceId : 'unavailable', label: available ? input.label : 'Optional crossover unavailable', available };
}

export function careerStoryCrossoverList(inputs: Array<Parameters<typeof careerStoryCrossover>[0]>): CareerStoryCrossoverDto[] {
  return inputs.map(careerStoryCrossover);
}
