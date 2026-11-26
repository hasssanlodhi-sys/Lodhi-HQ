<?php

declare(strict_types=1);

/**
 * AES-256-GCM for integration secrets. The key is config.php app_key
 * (or LODHI_APP_KEY in tests). Ciphertext is base64(iv || tag || body).
 */

function app_key_raw(): string
{
    $fromEnv = getenv('LODHI_APP_KEY');
    if (is_string($fromEnv) && strlen($fromEnv) >= 16) {
        return $fromEnv;
    }
    $key = app_config()['app_key'] ?? '';
    if (!is_string($key) || strlen($key) < 16) {
        throw new RuntimeException('Add app_key to api/config.php (at least 16 characters) before saving integration secrets.');
    }
    return $key;
}

function secret_key_bytes(): string
{
    return hash('sha256', app_key_raw(), true);
}

function secret_encrypt(string $plaintext): string
{
    if (!function_exists('openssl_encrypt')) {
        throw new RuntimeException('The PHP openssl extension is required to store integration secrets.');
    }
    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($plaintext, 'aes-256-gcm', secret_key_bytes(), OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false || strlen($tag) !== 16) {
        throw new RuntimeException('Could not encrypt the credential.');
    }
    return base64_encode($iv . $tag . $cipher);
}

function secret_decrypt(string $stored): string
{
    if (!function_exists('openssl_decrypt')) {
        throw new RuntimeException('The PHP openssl extension is required to read integration secrets.');
    }
    $raw = base64_decode($stored, true);
    if ($raw === false || strlen($raw) < 29) {
        throw new RuntimeException('Stored credential is unreadable. Save it again.');
    }
    $iv = substr($raw, 0, 12);
    $tag = substr($raw, 12, 16);
    $cipher = substr($raw, 28);
    $plain = openssl_decrypt($cipher, 'aes-256-gcm', secret_key_bytes(), OPENSSL_RAW_DATA, $iv, $tag);
    if ($plain === false) {
        throw new RuntimeException('Could not decrypt a credential. Check that app_key in api/config.php has not changed.');
    }
    return $plain;
}
