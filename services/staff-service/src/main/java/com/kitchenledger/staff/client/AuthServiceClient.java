package com.kitchenledger.staff.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

import java.util.Map;
import java.util.UUID;

@Component
@Slf4j
public class AuthServiceClient {

    private final RestTemplate restTemplate;
    private final String authServiceUrl;
    private final String internalServiceSecret;

    public AuthServiceClient(
            RestTemplate restTemplate,
            @Value("${auth.service-url:http://localhost:8081}") String authServiceUrl,
            @Value("${internal.service-secret:}") String internalServiceSecret) {
        this.restTemplate = restTemplate;
        this.authServiceUrl = authServiceUrl;
        this.internalServiceSecret = internalServiceSecret;
    }

    /**
     * Fetches the tenant's configured timezone from auth-service.
     * Returns "UTC" on any error so overtime calculations degrade gracefully.
     */
    public String getTenantTimezone(UUID tenantId) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("X-Internal-Service-Secret", internalServiceSecret);

            ResponseEntity<Map> response = restTemplate.exchange(
                    authServiceUrl + "/internal/auth/tenants/" + tenantId,
                    HttpMethod.GET,
                    new HttpEntity<>(headers),
                    Map.class
            );

            if (response.getBody() != null) {
                Object data = response.getBody().get("data");
                if (data instanceof Map<?, ?> dataMap) {
                    Object tz = dataMap.get("timezone");
                    if (tz instanceof String s && !s.isBlank()) {
                        return s;
                    }
                }
            }
        } catch (RestClientException e) {
            log.warn("Could not fetch timezone for tenant {}: {}", tenantId, e.getMessage());
        }
        return "UTC";
    }
}
