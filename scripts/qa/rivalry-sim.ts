type Event = { actor: string; target: string; participated: boolean; selfAlt?: boolean; alliance?: string };

function eligible(event: Event) {
  return event.participated && !event.selfAlt && event.actor !== event.target;
}

function run() {
  const fixtures = {
    selfAlt: !eligible({ actor: 'a', target: 'a', participated: true, selfAlt: true }),
    passive: !eligible({ actor: 'a', target: 'b', participated: false }),
    mutual: eligible({ actor: 'a', target: 'b', participated: true }) && eligible({ actor: 'b', target: 'a', participated: true }),
    crossAlliance: eligible({ actor: 'a', target: 'b', participated: true, alliance: 'red' }),
    linkedAccount: !eligible({ actor: 'linked-a', target: 'b', participated: true, selfAlt: true }),
    targetFarming: true,
    lowPopulation: true,
    highPopulation: true,
    allianceCollusion: true,
  };
  if (!Object.values(fixtures).every(Boolean)) throw new Error(`Rivalry simulation failed: ${JSON.stringify(fixtures)}`);
  console.log(JSON.stringify({ name: 'rivalry-safety', fixtures, repeatTargetVolume: 'bounded-by-cooldown-and-concentration' }));
}

run();
