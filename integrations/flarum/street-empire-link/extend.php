<?php

use Flarum\Extend;
use Flarum\Api\Serializer\ForumSerializer;
use StreetEmpire\ForumLink\ConfirmController;
use StreetEmpire\ForumLink\ForumAttributes;
use StreetEmpire\ForumLink\PreviewController;
use StreetEmpire\ForumLink\ProfileController;
use StreetEmpire\ForumLink\UserRedirectController;

return [
    (new Extend\Frontend('forum'))
        ->js(__DIR__.'/js/forum.js')
        ->css(__DIR__.'/less/forum.less')
        ->route('/street-empire/link', 'street-empire.link'),
    (new Extend\Routes('forum'))
        ->get('/street-empire/u/{id}', 'street-empire.user', UserRedirectController::class),
    (new Extend\Routes('api'))
        ->post('/street-empire/preview', 'street-empire.preview', PreviewController::class)
        ->post('/street-empire/confirm', 'street-empire.confirm', ConfirmController::class)
        ->get('/street-empire/users/{id}', 'street-empire.profile', ProfileController::class),
    (new Extend\ApiSerializer(ForumSerializer::class))->attributes(ForumAttributes::class),
];
