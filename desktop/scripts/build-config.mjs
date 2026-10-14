import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(new URL('../src/generated-config.json', import.meta.url));
const clientId = process.env.STREETSEMPIRE_DISCORD_CLIENT_ID?.trim() ?? '';
const largeImage = process.env.STREETSEMPIRE_DISCORD_LARGE_IMAGE_KEY?.trim() ?? '';
const smallImage = process.env.STREETSEMPIRE_DISCORD_SMALL_IMAGE_KEY?.trim() ?? '';
const validAssetKey = (key) => !key || /^[a-z0-9_-]{1,128}$/.test(key);

if (!validAssetKey(largeImage) || !validAssetKey(smallImage)) {
  console.error('Discord Rich Presence artwork keys must be 1-128 lowercase letters, numbers, hyphens or underscores.');
  process.exitCode = 1;
} else if (clientId && !/^\d{17,20}$/.test(clientId)) {
  console.error('STREETSEMPIRE_DISCORD_CLIENT_ID must be a 17-20 digit Discord Application ID.');
  process.exitCode = 1;
} else {
  writeFileSync(filename, JSON.stringify({
    discordClientId: clientId,
    discordAssets: { largeImage, smallImage },
  }) + '\n');
  console.log(clientId
    ? 'Desktop Discord application ID configured (not a secret).'
    : 'Desktop game configured without Discord RPC; set STREETSEMPIRE_DISCORD_CLIENT_ID to enable it.');
}
