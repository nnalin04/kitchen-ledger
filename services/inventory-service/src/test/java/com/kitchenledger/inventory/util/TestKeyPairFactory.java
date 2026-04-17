package com.kitchenledger.inventory.util;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.util.Base64;

/**
 * Generates a throwaway RSA-2048 key pair for use in tests.
 * Keys are generated once per JVM (static initializer).
 */
public final class TestKeyPairFactory {

    private static final KeyPair KEY_PAIR;

    static {
        try {
            KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
            kpg.initialize(2048);
            KEY_PAIR = kpg.generateKeyPair();
        } catch (Exception e) {
            throw new RuntimeException("Could not generate test RSA key pair", e);
        }
    }

    private TestKeyPairFactory() {}

    public static RSAPrivateKey privateKey() {
        return (RSAPrivateKey) KEY_PAIR.getPrivate();
    }

    public static RSAPublicKey publicKey() {
        return (RSAPublicKey) KEY_PAIR.getPublic();
    }

    /** Returns the PKCS8 private key as a PEM string (for Spring property injection). */
    public static String privatePem() {
        String b64 = Base64.getEncoder().encodeToString(KEY_PAIR.getPrivate().getEncoded());
        return "-----BEGIN PRIVATE KEY-----\n" + wrap64(b64) + "\n-----END PRIVATE KEY-----";
    }

    /** Returns the X509 public key as a PEM string (for Spring property injection). */
    public static String publicPem() {
        String b64 = Base64.getEncoder().encodeToString(KEY_PAIR.getPublic().getEncoded());
        return "-----BEGIN PUBLIC KEY-----\n" + wrap64(b64) + "\n-----END PUBLIC KEY-----";
    }

    private static String wrap64(String s) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i += 64) {
            sb.append(s, i, Math.min(i + 64, s.length())).append('\n');
        }
        return sb.toString().stripTrailing();
    }
}
