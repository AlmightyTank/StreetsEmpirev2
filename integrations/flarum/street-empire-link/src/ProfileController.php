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

    public function __construct(private BridgeConfig $config, private Cache $cache) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $id = (string) ($request->getQueryParams()['id'] ?? '');
        if (!$this->config->enabled() || !preg_match('/^[1-9][0-9]{0,19}$/D', $id)) return $this->respond(null);

        // Keyed by game origin so changing it never serves the old game's answer.
        $key = 'street-empire.profile-link.'.sha1($this->config->gameOrigin).'.'.$id;
        $cached = $this->cache->get($key);
        if (is_string($cached)) return $this->respond($cached === '' ? null : $cached);

        try {
            // No cookies, secrets, or private forum data leave Flarum.
            $response = (new Client())->get($this->config->gameOrigin.'/api/forum/users/'.$id, [
                'timeout' => 3, 'connect_timeout' => 2, 'allow_redirects' => false,
                'headers' => ['Accept' => 'application/json'],
            ]);
            $data = json_decode((string) $response->getBody(), true);
            if ($response->getStatusCode() !== 200 || !is_array($data) || !array_key_exists('profileUrl', $data)) return $this->respond(null);
            $expected = $this->config->gameOrigin.'/game/forum/'.$id;
            $url = $data['profileUrl'] === $expected ? $expected : null;
            // Cache "not linked" too ('' marks it); that is most forum users.
            $this->cache->put($key, $url ?? '', self::CACHE_SECONDS);
            return $this->respond($url);
        } catch (Throwable) {
            // A game outage or rate limit must not break forum profiles; do not cache it.
            return $this->respond(null);
        }
    }

    private function respond(?string $url): ResponseInterface
    {
        return new JsonResponse(['profileUrl' => $url], 200, ['Cache-Control' => 'no-store']);
    }
}
