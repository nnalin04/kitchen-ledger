package com.kitchenledger.auth.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.security.KeyFactory;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

@Configuration
public class JwtConfig {

    @Value("${jwt.private-key:}")
    private String privateKeyPem;

    @Value("${jwt.public-key:}")
    private String publicKeyPem;

    @Bean
    public RSAPrivateKey rsaPrivateKey() throws Exception {
        if (privateKeyPem == null || privateKeyPem.isBlank()) {
            throw new IllegalStateException("JWT_PRIVATE_KEY (jwt.private-key) must be set");
        }
        String pem = stripPemHeaders(privateKeyPem, "PRIVATE KEY", "RSA PRIVATE KEY");
        byte[] keyBytes = Base64.getDecoder().decode(pem);
        PKCS8EncodedKeySpec spec = new PKCS8EncodedKeySpec(keyBytes);
        return (RSAPrivateKey) KeyFactory.getInstance("RSA").generatePrivate(spec);
    }

    @Bean
    public RSAPublicKey rsaPublicKey() throws Exception {
        if (publicKeyPem == null || publicKeyPem.isBlank()) {
            throw new IllegalStateException("JWT_PUBLIC_KEY (jwt.public-key) must be set");
        }
        String pem = stripPemHeaders(publicKeyPem, "PUBLIC KEY", "RSA PUBLIC KEY");
        byte[] keyBytes = Base64.getDecoder().decode(pem);
        X509EncodedKeySpec spec = new X509EncodedKeySpec(keyBytes);
        return (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(spec);
    }

    /**
     * Strips PEM header/footer lines and whitespace, leaving only the Base64-encoded body.
     * Handles both single-line (\n-separated) and multi-line PEM formats.
     */
    private String stripPemHeaders(String pem, String... headerTypes) {
        String normalized = pem.replace("\\n", "\n");
        String[] lines = normalized.split("\\r?\\n");
        StringBuilder base64 = new StringBuilder();
        for (String line : lines) {
            String trimmed = line.trim();
            boolean isHeader = false;
            for (String type : headerTypes) {
                if (trimmed.startsWith("-----BEGIN " + type)
                        || trimmed.startsWith("-----END " + type)) {
                    isHeader = true;
                    break;
                }
            }
            if (!isHeader && !trimmed.isEmpty()) {
                base64.append(trimmed);
            }
        }
        return base64.toString();
    }
}
