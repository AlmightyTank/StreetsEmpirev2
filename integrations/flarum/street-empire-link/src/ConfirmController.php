<?php
namespace StreetEmpire\ForumLink;

use Flarum\Http\RequestUtil;
use Flarum\User\Exception\PermissionDeniedException;
use InvalidArgumentException;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

class ConfirmController implements RequestHandlerInterface
{
    public function __construct(private BridgeConfig $config) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        if ($actor->isGuest()) throw new PermissionDeniedException();
        if (!$this->config->enabled()) return new JsonResponse(['message' => 'Forum linking is not available yet.'], 503);
        $body = $request->getParsedBody();
        if (($body['forumUserId'] ?? null) !== (string) $actor->id) return new JsonResponse(['message' => 'Your forum account changed. Reload and confirm again.'], 409);
        try {
            $token = $body['request'] ?? '';
            if (!is_string($token)) throw new InvalidArgumentException('Invalid linking request.');
            $data = Proof::request($token, $this->config->secret, $this->config->gameOrigin, $this->config->forumOrigin);
            $proof = Proof::encode([
                'v' => 1, 'purpose' => 'forum-link-response', 'iss' => $this->config->forumOrigin, 'aud' => $this->config->gameOrigin,
                'nonce' => $data['nonce'], 'userId' => (string) $actor->id, 'username' => $actor->username,
                'iat' => time(), 'exp' => $data['exp'],
            ], $this->config->secret);
            return new JsonResponse(['url' => $this->config->gameOrigin.'/account/forum-link#proof='.$proof], 200, ['Cache-Control' => 'no-store']);
        } catch (InvalidArgumentException $error) {
            return new JsonResponse(['message' => $error->getMessage()], 400);
        }
    }
}
