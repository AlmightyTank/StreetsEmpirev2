import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(new URL('../src/generated-config.json', import.meta.url));
const clientId = process.env.STREETSEMPIRE_DISCORD_CLIENT_ID?.trim() ?? '';

if (clientId && !/^\d{17,20}$/.test(clientId)) {
  console.error('STREETSEMPIRE_DISCORD_CLIENT_ID must be a 17-20 digit Discord Application ID.');
  process.exitCode = 1;
} else {
  writeFileSync(filename, JSON.stringify({ discordClientId: clientId }) + '\n');
  console.log(clientId
    ? 'Desktop Discord application ID configured (not a secret).'
    : 'Desktop game configured without Discord RPC; set STREETSEMPIRE_DISCORD_CLIENT_ID to enable it.');
}
