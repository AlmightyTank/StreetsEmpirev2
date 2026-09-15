<?php
namespace StreetEmpire\ForumLink;

use Flarum\Foundation\Config;
use RuntimeException;

class BridgeConfig
{
    public string $gameOrigin;
    public string $forumOrigin;
    public string $secret;

    public function __construct(Config $config)
    {
        $this->gameOrigin = rtrim((string) ($config['street_empire.game_origin'] ?? ''), '/');
        $this->forumOrigin = rtrim((string) $config['url'], '/');
        $this->secret = (string) ($config['street_empire.link_secret'] ?? '');
    }

    public function enabled(): bool
    {
        return strlen($this->secret) >= 64 && $this->validOrigin($this->gameOrigin) && $this->validOrigin($this->forumOrigin);
    }

    public function requireEnabled(): void
    {
        if (!$this->enabled()) throw new RuntimeException('StreetsEmpire profile linking is not configured.');
    }

    private function validOrigin(string $origin): bool
    {
        $url = parse_url($origin);
        if (!$url || empty($url['host']) || isset($url['user']) || isset($url['pass']) || isset($url['path']) || isset($url['query']) || isset($url['fragment'])) return false;
        return ($url['scheme'] ?? '') === 'https' || (($url['scheme'] ?? '') === 'http' && in_array($url['host'], ['localhost', '127.0.0.1', '[::1]'], true));
    }
}
