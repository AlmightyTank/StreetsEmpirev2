<?php
namespace StreetEmpire\ForumLink;

use InvalidArgumentException;

/** Mirrors the game's fixed HMAC-SHA256 protocol. No algorithm negotiation. */
class Proof
{
    public static function encode(array $payload, string $secret): string
    {
        $encoded = self::base64url(json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        return $encoded.'.'.self::base64url(hash_hmac('sha256', $encoded, $secret, true));
    }

    public static function request(string $token, string $secret, string $gameOrigin, string $forumOrigin, ?int $now = null): array
    {
        $invalid = static function () { throw new InvalidArgumentException('This linking request expired or is invalid. Start again from your game account settings.'); };
        if (strlen($secret) < 64 || strlen($token) > 4096 || !preg_match('/^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/D', $token, $parts)) $invalid();
        $signature = self::base64url(hash_hmac('sha256', $parts[1], $secret, true));
        if (!hash_equals($signature, $parts[2])) $invalid();
        $json = base64_decode(strtr($parts[1], '-_', '+/'), true);
        $data = $json === false ? null : json_decode($json, true);
        if (!is_array($data) || count($data) !== 8 || ($data['v'] ?? null) !== 1 || ($data['purpose'] ?? '') !== 'forum-link-request' ||
            ($data['iss'] ?? '') !== $gameOrigin || ($data['aud'] ?? '') !== $forumOrigin ||
            !is_string($data['nonce'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $data['nonce']) ||
            !is_string($data['username'] ?? null) || strlen($data['username']) < 1 || strlen($data['username']) > 400 ||
            !is_int($data['iat'] ?? null) || !is_int($data['exp'] ?? null)) $invalid();
        $now = $now ?? time();
        if ($data['exp'] <= $now || $data['iat'] > $now + 30 || $data['exp'] <= $data['iat'] || $data['exp'] - $data['iat'] > 600) $invalid();
        return $data;
    }

    private static function base64url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
