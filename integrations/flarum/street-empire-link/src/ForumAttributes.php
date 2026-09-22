<?php
namespace StreetEmpire\ForumLink;

class ForumAttributes
{
    public function __construct(private BridgeConfig $config) {}

    public function __invoke($serializer, $model, array $attributes): array
    {
        // The shared secret must never be serialized to either frontend.
        return [
            'streetEmpireLinkEnabled' => $this->config->enabled(),
            'streetEmpireGameOrigin' => $this->config->enabled() ? $this->config->gameOrigin : null,
            'streetEmpireGameOrigins' => $this->config->enabled() ? $this->config->gameOrigins() : [],
        ];
    }
}
