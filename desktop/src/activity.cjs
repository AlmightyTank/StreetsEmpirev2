'use strict';

const GAME_ORIGINS = Object.freeze({
  live: 'https://play.streetsempire.dev',
  beta: 'https://beta.streetsempire.dev',
});

const ALLOWED_HOSTS = new Set([
  'play.streetsempire.dev',
  'beta.streetsempire.dev',
  'discord.com',
  'www.discord.com',
]);

function trustedNavigation(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && ALLOWED_HOSTS.has(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function externalLink(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** Coarse page-only labels: never read or publish hidden game state. */
function presenceForUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  if (url.origin !== GAME_ORIGINS.live && url.origin !== GAME_ORIGINS.beta) return null;
  const path = url.pathname.toLowerCase().replace(/\/+$/, '') || '/';
  if (path !== '/game' && !path.startsWith('/game/')) return null;

  let state = 'Building an empire';
  if (path.startsWith('/game/casino/slots')) state = 'Playing Slots';
  else if (path.startsWith('/game/casino/blackjack')) state = 'Playing Blackjack';
  else if (path.startsWith('/game/casino/roulette')) state = 'Playing Roulette';
  else if (path.startsWith('/game/casino/scratch-cards')) state = 'Playing Scratch Cards';
  else if (path.startsWith('/game/casino/horse-racing')) state = 'At the Horse Races';
  else if (path.startsWith('/game/casino/poker')) state = 'Playing Poker';
  else if (path.startsWith('/game/casino')) state = 'At the casino';
  else if (path.startsWith('/game/scout')) state = 'Scouting the streets';
  else if (path.startsWith('/game/produce')) state = 'Running production';
  else if (path.startsWith('/game/turf') || path.startsWith('/game/city-block')) state = 'Fighting for turf';
  else if (path.startsWith('/game/quest')) state = 'Completing quests';
  else if (path.startsWith('/game/crew') || path.startsWith('/game/hideout')) state = 'Managing the crew';
  else if (path.startsWith('/game/ranking')) state = 'Checking the rankings';
  else if (path.startsWith('/game/travel')) state = 'Traveling the streets';
  return { details: 'Playing StreetsEmpire', state };
}

module.exports = { GAME_ORIGINS, trustedNavigation, externalLink, presenceForUrl };
