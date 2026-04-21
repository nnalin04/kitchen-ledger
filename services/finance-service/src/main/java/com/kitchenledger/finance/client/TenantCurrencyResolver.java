package com.kitchenledger.finance.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Resolves the configured currency for a tenant by calling the auth-service
 * internal API ({@code GET /internal/auth/tenants/{tenantId}}).
 *
 * <p>Results are cached in-process for the lifetime of the JVM. Currency changes
 * require a service restart; this is acceptable because currency is a rare,
 * admin-only setting.
 *
 * <p>Used by scheduled jobs (e.g. {@link com.kitchenledger.finance.job.OverduePaymentJob})
 * that run without an HTTP request context and therefore cannot read the
 * {@code X-Tenant-Currency} header that the Gateway normally forwards.
 */
@Component
@Slf4j
public class TenantCurrencyResolver {

    private static final String DEFAULT_CURRENCY = "INR";

    private final RestTemplate restTemplate;
    private final String authServiceUrl;
    private final String internalServiceSecret;

    /** Simple in-process cache; tenant count in a typical deployment is small. */
    private final ConcurrentHashMap<UUID, String> cache = new ConcurrentHashMap<>();

    public TenantCurrencyResolver(
            RestTemplate restTemplate,
            @Value("${auth.service-url:http://localhost:8081}") String authServiceUrl,
            @Value("${internal.service-secret:}") String internalServiceSecret) {
        this.restTemplate = restTemplate;
        this.authServiceUrl = authServiceUrl;
        this.internalServiceSecret = internalServiceSecret;
    }

    /**
     * Returns the currency code for the given tenant, e.g. {@code "INR"}, {@code "USD"}.
     * Falls back to {@value #DEFAULT_CURRENCY} on any error so that batch jobs
     * continue to run even when auth-service is temporarily unavailable.
     */
    public String resolve(UUID tenantId) {
        return cache.computeIfAbsent(tenantId, this::fetchFromAuthService);
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private String fetchFromAuthService(UUID tenantId) {
        try {
            org.springframework.http.HttpHeaders headers = new org.springframework.http.HttpHeaders();
            headers.set("X-Internal-Service-Secret", internalServiceSecret);
            org.springframework.http.HttpEntity<Void> entity =
                    new org.springframework.http.HttpEntity<>(headers);

            String url = authServiceUrl + "/internal/auth/tenants/" + tenantId;
            org.springframework.http.ResponseEntity<Map> response =
                    restTemplate.exchange(url,
                            org.springframework.http.HttpMethod.GET,
                            entity,
                            Map.class);

            if (response.getBody() != null) {
                Map<String, Object> data = (Map<String, Object>) response.getBody().get("data");
                if (data != null && data.get("currency") instanceof String c && !c.isBlank()) {
                    log.debug("TenantCurrencyResolver: resolved currency {} for tenant {}", c, tenantId);
                    return c;
                }
            }
        } catch (RestClientException e) {
            log.warn("TenantCurrencyResolver: could not fetch currency for tenant {} from auth-service — using default {}. Error: {}",
                    tenantId, DEFAULT_CURRENCY, e.getMessage());
        }
        return DEFAULT_CURRENCY;
    }
}
