<?php
namespace StreetEmpire\ForumLink;

use Flarum\Http\RequestUtil;
use Flarum\Http\SlugManager;
use Flarum\Http\UrlGenerator;
use Flarum\User\User;
use Flarum\User\UserRepository;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Laminas\Diactoros\Response\RedirectResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * Stable profile URL keyed by user ID. The game stores forum IDs, but Flarum's
 * /u/{slug} route resolves through the slug driver (usernames by default), and
 * usernames can change.
 */
class UserRedirectController implements RequestHandlerInterface
{
    public function __construct(private UserRepository $users, private SlugManager $slugs, private UrlGenerator $url) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $id = (string) ($request->getQueryParams()['id'] ?? '');
        if (!preg_match('/^[1-9][0-9]{0,19}$/D', $id)) throw new ModelNotFoundException();
        // Respects Flarum's visibility rules; hidden users 404 like /u/{slug} would.
        $user = $this->users->findOrFail($id, RequestUtil::getActor($request));
        $slug = $this->slugs->forResource(User::class)->toSlug($user);
        return new RedirectResponse($this->url->to('forum')->route('user', ['username' => $slug]), 302);
    }
}
