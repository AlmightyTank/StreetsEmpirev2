<?php
namespace StreetEmpire\ForumLink;

use GuzzleHttp\Client;
use Illuminate\Contracts\Cache\Repository as Cache;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Throwable;

class ProfileController implements RequestHandlerInterface
{
    /** Bounds both staleness after link/unlink and load on the game's per-IP rate limit. */
    private const CACHE_SECONDS = 120;
    private const MAX_BADGES = 6;
    private const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    private const CATEGORIES = ['rank', 'wealth', 'combat', 'intel', 'reputation', 'legacy'];

    public function __construct(private BridgeConfig $config, private Cache $cache) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $id = (string) ($request->getQueryParams()['id'] ?? '');
        if (!$this->config->enabled() || !preg_match('/^[1-9][0-9]{0,19}$/D', $id)) return $this->respond(null, []);

        // Keyed by game origin so changing it never serves the old game's answer.
        // v2: the cached value became a JSON object with badges.
        $key = 'street-empire.profile-link.v2.'.sha1($this->config->gameOrigin).'.'.$id;
        $cached = $this->cache->get($key);
        $decoded = is_string($cached) ? json_decode($cached, true) : null;
        if (is_array($decoded) && array_key_exists('profileUrl', $decoded) && is_array($decoded['badges'] ?? null)) {
            return $this->respond($decoded['profileUrl'], $decoded['badges']);
        }

        try {
            // No cookies, secrets, or private forum data leave Flarum.
            $response = (new Client())->get($this->config->gameOrigin.'/api/forum/users/'.$id, [
                'timeout' => 3, 'connect_timeout' => 2, 'allow_redirects' => false,
                'headers' => ['Accept' => 'application/json'],
            ]);
            $data = json_decode((string) $response->getBody(), true);
            if ($response->getStatusCode() !== 200 || !is_array($data) || !array_key_exists('profileUrl', $data)) return $this->respond(null, []);
            $expected = $this->config->gameOrigin.'/game/forum/'.$id;
            $url = $data['profileUrl'] === $expected ? $expected : null;
            $badges = $url ? $this->badges($data['badges'] ?? null) : [];
            // Cache "not linked" too; that is most forum users.
            $this->cache->put($key, json_encode(['profileUrl' => $url, 'badges' => $badges], JSON_UNESCAPED_UNICODE), self::CACHE_SECONDS);
            return $this->respond($url, $badges);
        } catch (Throwable) {
            // A game outage or rate limit must not break forum profiles; do not cache it.
            return $this->respond(null, []);
        }
    }

    /** Only well-formed, bounded badge fields reach the forum page. */
    private function badges(mixed $value): array
    {
        if (!is_array($value)) return [];
        $badges = [];
        foreach (array_slice($value, 0, self::MAX_BADGES) as $badge) {
            if (!is_array($badge)
                || !is_string($badge['key'] ?? null) || !preg_match('/^[a-z0-9-]{1,40}$/D', $badge['key'])
                || !is_string($badge['title'] ?? null) || $badge['title'] === ''
                || !is_string($badge['description'] ?? null)
                || !in_array($badge['rarity'] ?? null, self::RARITIES, true)
                || !in_array($badge['category'] ?? null, self::CATEGORIES, true)
                || !is_bool($badge['permanent'] ?? null)) continue;
            $badges[] = [
                'key' => $badge['key'],
                'title' => mb_substr($badge['title'], 0, 40),
                'description' => mb_substr($badge['description'], 0, 200),
                'rarity' => $badge['rarity'],
                'category' => $badge['category'],
                'permanent' => $badge['permanent'],
            ];
        }
        return $badges;
    }

    private function respond(?string $url, array $badges): ResponseInterface
    {
        return new JsonResponse(['profileUrl' => $url, 'badges' => $badges], 200, ['Cache-Control' => 'no-store']);
    }
}
