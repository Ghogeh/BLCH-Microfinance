<?php

if (!function_exists('keccak256')) {
    /**
     * Compute the Keccak-256 hash of the input.
     * This is Ethereum's primary hash function (NOT the same as SHA3-256).
     *
     * @param string $input  Raw bytes or UTF-8 string to hash
     * @param bool   $raw    true = return raw binary; false = return hex string
     */
    function keccak256(string $input, bool $raw = false): string
    {
        $hash = \kornrunner\Keccak::hash($input, 256);
        return $raw ? hex2bin($hash) : $hash;
    }
}
