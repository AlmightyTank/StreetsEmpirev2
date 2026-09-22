<?php
namespace StreetEmpire\ForumLink;

use Flarum\Foundation\Config;
use InvalidArgumentException;
use RuntimeException;

class BridgeConfig
{
    public string $gameOrigin;
    public string $forumOrigin;
    public string $secret;
    private array $bridges = [];

    public function __construct(Config $config)
    {
        $this->forumOrigin = rtrim((string) $config['url'], '/');
        $legacyOrigin = rtrim((string) ($config['street_empire.game_origin'] ?? ''), '/');
        $legacySecret = (string) ($config['street_empire.link_secret'] ?? '');
        $this->addBridge($legacyOrigin, $legacySecret);

        $configured = $config['street_empire.game_origins'] ?? [];
        if (is_array($configured)) {
            foreach ($configured as $origin => $secret) {
                if (is_array($secret)) {
                    $this->addBridge((string) ($secret['origin'] ?? ''), (string) ($secret['secret'] ?? ''));
                } elseif (is_string($origin)) {
                    $this->addBridge((string) $origin, (string) $secret);
                }
            }
        }

        $primary = $this->bridges[0] ?? ['origin' => $legacyOrigin, 'secret' => $legacySecret];
        $this->gameOrigin = $primary['origin'];
        $this->secret = $primary['secret'];
    }

    public function enabled(): bool
    {
        return $this->validOrigin($this->forumOrigin) && count($this->bridges) > 0;
    }

    public function requireEnabled(): void
    {
        if (!$this->enabled()) throw new RuntimeException('StreetsEmpire profile linking is not configured.');
    }

    public function gameOrigins(): array
    {
        return array_map(fn ($bridge) => $bridge['origin'], $this->bridges);
    }

    public function gameBridges(): array
    {
        return $this->bridges;
    }

    public function verifyRequest(string $token): array
    {
        foreach ($this->bridges as $bridge) {
            try {
                return [
                    'origin' => $bridge['origin'],
                    'secret' => $bridge['secret'],
                    'data' => Proof::request($token, $bridge['secret'], $bridge['origin'], $this->forumOrigin),
                ];
            } catch (InvalidArgumentException) {
                // Try the next configured game origin.
            }
        }
        throw new InvalidArgumentException('This linking request expired or is invalid. Start again from your game account settings.');
    }

    private function addBridge(string $origin, string $secret): void
    {
        $origin = rtrim($origin, '/');
        if (strlen($secret) < 64 || !$this->validOrigin($origin)) return;
        foreach ($this->bridges as $bridge) {
            if ($bridge['origin'] === $origin) return;
        }
        $this->bridges[] = ['origin' => $origin, 'secret' => $secret];
    }

    private function validOrigin(string $origin): bool
    {
        $url = parse_url($origin);
        if (!$url || empty($url['host']) || isset($url['user']) || isset($url['pass']) || isset($url['path']) || isset($url['query']) || isset($url['fragment'])) return false;
        return ($url['scheme'] ?? '') === 'https' || (($url['scheme'] ?? '') === 'http' && in_array($url['host'], ['localhost', '127.0.0.1', '[::1]'], true));
    }
}
