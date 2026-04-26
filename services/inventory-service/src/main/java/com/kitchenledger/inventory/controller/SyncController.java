package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.dto.response.InventorySyncItem;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.security.GatewayTrustFilter;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Mobile offline-first sync endpoint.
 *
 * <p>Clients send {@code lastPulledAt} (epoch millis) to receive only changes
 * since their last successful pull.  Omitting the parameter triggers a full sync.
 */
@RestController
@RequestMapping("/api/v1/inventory/sync")
@RequiredArgsConstructor
public class SyncController {

    private final InventoryItemRepository itemRepository;

    /**
     * Pull incremental changes since {@code lastPulledAt}.
     *
     * <p>Response shape:
     * <pre>{@code
     * {
     *   "timestamp": <epoch-millis>,
     *   "changes": {
     *     "inventory_items": {
     *       "created": [...],
     *       "updated": [...],
     *       "deleted": [<uuid>, ...]
     *     }
     *   }
     * }
     * }</pre>
     */
    @GetMapping("/pull")
    @Transactional(readOnly = true)
    public ResponseEntity<Map<String, Object>> pull(
            HttpServletRequest req,
            @RequestParam(required = false) Long lastPulledAt) {

        UUID tenantId = (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);

        // Full sync when no timestamp is provided (first-time or reset)
        Instant since = lastPulledAt != null
                ? Instant.ofEpochMilli(lastPulledAt)
                : Instant.EPOCH;

        // Items created after `since`
        List<InventorySyncItem> created = itemRepository
                .findByTenantIdAndCreatedAtAfterAndDeletedAtIsNull(tenantId, since)
                .stream()
                .map(InventorySyncItem::from)
                .toList();

        // Items updated after `since` that were NOT newly created in the same window
        List<InventorySyncItem> updated = itemRepository
                .findByTenantIdAndUpdatedAtAfterAndCreatedAtBeforeAndDeletedAtIsNull(
                        tenantId, since, since)
                .stream()
                .map(InventorySyncItem::from)
                .toList();

        // UUIDs of items soft-deleted after `since`
        List<UUID> deleted = itemRepository
                .findIdsByTenantIdAndDeletedAtAfter(tenantId, since);

        return ResponseEntity.ok(Map.of(
                "timestamp", Instant.now().toEpochMilli(),
                "changes", Map.of(
                        "inventory_items", Map.of(
                                "created", created,
                                "updated", updated,
                                "deleted", deleted
                        )
                )
        ));
    }
}
