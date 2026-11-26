<?php

declare(strict_types=1);

/**
 * curl HTTP with timeouts, manual redirects, and a host allow-list.
 * Integrations must not be able to point the server at an internal address.
 */

function http_assert_https_host(string $url, array $allowedSuffixes): void
{
    $parts = parse_url($url);
    if (!is_array($parts)) {
        throw new RuntimeException('The URL is invalid.');
    }
    if (isset($parts['user']) || isset($parts['pass'])) {
        throw new RuntimeException('The URL cannot include a username.');
    }
    $scheme = strtolower((string) ($parts['scheme'] ?? ''));
    $host = strtolower((string) ($parts['host'] ?? ''));
    if ($scheme !== 'https' || $host === '' || str_contains($host, '..')) {
        throw new RuntimeException('The URL must start with https.');
    }
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        throw new RuntimeException('The URL must use a hostname.');
    }
    foreach ($allowedSuffixes as $suffix) {
        $suffix = strtolower((string) $suffix);
        if ($suffix !== '' && ($host === $suffix || str_ends_with($host, '.' . $suffix))) {
            return;
        }
    }
    throw new RuntimeException('That address is not allowed for this integration.');
}

function http_resolve(string $base, string $location): string
{
    if (preg_match('#^https?://#i', $location) === 1) {
        return $location;
    }
    $parts = parse_url($base);
    $origin = ($parts['scheme'] ?? 'https') . '://' . ($parts['host'] ?? '');
    if (isset($parts['port'])) {
        $origin .= ':' . $parts['port'];
    }
    if (str_starts_with($location, '/')) {
        return $origin . $location;
    }
    $path = (string) ($parts['path'] ?? '/');
    $dir = preg_replace('#/[^/]*$#', '/', $path) ?? '/';
    return $origin . $dir . $location;
}

function http_call(string $method, string $url, array $options = []): array
{
    if (!function_exists('curl_init')) {
        throw new RuntimeException('The PHP curl extension is required for integrations.');
    }
    $method = strtoupper($method);
    $timeout = max(1, (int) ($options['timeout'] ?? 25));
    $connect = max(1, (int) ($options['connect_timeout'] ?? 10));
    $headers = $options['headers'] ?? [];
    $body = $options['body'] ?? null;
    $allowed = $options['allowed_hosts'] ?? null;
    $maxBytes = (int) ($options['max_bytes'] ?? 8000000);
    $current = $url;
    $currentMethod = $method;
    $currentBody = $body;

    for ($hop = 0; $hop < 5; $hop++) {
        if (is_array($allowed)) {
            http_assert_https_host($current, $allowed);
        }
        $respHeaders = [];
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $current,
            CURLOPT_CUSTOMREQUEST => $currentMethod,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HEADERFUNCTION => static function ($ch, string $line) use (&$respHeaders): int {
                $parts = explode(':', trim($line), 2);
                if (count($parts) === 2) {
                    $respHeaders[strtolower(trim($parts[0]))] = trim($parts[1]);
                }
                return strlen($line);
            },
            CURLOPT_TIMEOUT => $timeout,
            CURLOPT_CONNECTTIMEOUT => $connect,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_USERAGENT => 'LodhiHQ/1.0',
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS | CURLPROTO_HTTP,
        ]);
        if (is_array($headers) && $headers !== []) {
            curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        }
        if ($currentBody !== null && $currentMethod !== 'GET' && $currentMethod !== 'HEAD') {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $currentBody);
        }
        $raw = curl_exec($ch);
        $errno = curl_errno($ch);
        $err = curl_error($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if ($raw === false || $errno !== 0) {
            throw new RuntimeException('Could not reach the service' . ($err !== '' ? ': ' . $err : '.'));
        }
        if (strlen((string) $raw) > $maxBytes) {
            throw new RuntimeException('The service response was too large.');
        }
        if (in_array($status, [301, 302, 303, 307, 308], true)) {
            $location = $respHeaders['location'] ?? '';
            if ($location === '') {
                throw new RuntimeException('The service redirected without a location.');
            }
            $current = http_resolve($current, $location);
            if ($status === 303 || (($status === 301 || $status === 302) && $currentMethod === 'POST')) {
                $currentMethod = 'GET';
                $currentBody = null;
            }
            continue;
        }
        return [
            'status' => $status,
            'body' => (string) $raw,
            'headers' => $respHeaders,
            'effective_url' => $current,
        ];
    }
    throw new RuntimeException('The service redirected too many times.');
}
