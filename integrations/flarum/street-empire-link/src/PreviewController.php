<?php
namespace StreetEmpire\ForumLink;

use Flarum\Http\RequestUtil;
use Flarum\User\Exception\PermissionDeniedException;
use InvalidArgumentException;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

class PreviewController implements RequestHandlerInterface
{
    public function __construct(protected BridgeConfig $config) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        if ($actor->isGuest()) throw new PermissionDeniedException();
        if (!$this->config->enabled()) return new JsonResponse(['message' => 'Forum linking is not available yet.'], 503);
        try {
            $token = $request->getParsedBody()['request'] ?? '';
            if (!is_string($token)) throw new InvalidArgumentException('Invalid linking request.');
            $verified = $this->config->verifyRequest($token);
            $data = $verified['data'];
            return new JsonResponse([
                'gameOrigin' => $verified['origin'],
                'gameUsername' => $data['username'],
                'forumUsername' => $actor->username,
                'forumUserId' => (string) $actor->id,
            ], 200, ['Cache-Control' => 'no-store']);
        } catch (InvalidArgumentException $error) {
            return new JsonResponse(['message' => $error->getMessage()], 400);
        }
    }
}
