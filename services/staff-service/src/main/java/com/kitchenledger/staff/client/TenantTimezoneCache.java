package com.kitchenledger.staff.client;

import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory TTL cache for tenant timezones.  Avoids an auth-service call on
 * every clock-out.  Entries expire after 5 minutes; a stale entry causes at
 * most one extra HTTP call per tenant per period.
 */
@Component
public class TenantTimezoneCache {

    private static final long TTL_SECONDS = 300;

    private record Entry(String timezone, Instant expiresAt) {}

    private final ConcurrentHashMap<UUID, Entry> store = new ConcurrentHashMap<>();
    private final AuthServiceClient authServiceClient;

    public TenantTimezoneCache(AuthServiceClient authServiceClient) {
        this.authServiceClient = authServiceClient;
    }

    public String get(UUID tenantId) {
        Entry entry = store.get(tenantId);
        if (entry != null && Instant.now().isBefore(entry.expiresAt())) {
            return entry.timezone();
        }
        String timezone = authServiceClient.getTenantTimezone(tenantId);
        store.put(tenantId, new Entry(timezone, Instant.now().plusSeconds(TTL_SECONDS)));
        return timezone;
    }
}
