package com.kitchenledger.inventory.dto.response;

import com.kitchenledger.inventory.model.InventoryItem;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Lightweight snapshot of an {@link InventoryItem} sent to mobile clients
 * during an offline-first pull-sync operation.
 */
@Data
@Builder
public class InventorySyncItem {

    private UUID id;
    private String name;
    private String abcCategory;
    private BigDecimal currentStock;
    private BigDecimal parLevel;
    private String countUnit;
    private String storageLocation;
    private boolean perishable;
    private BigDecimal avgCost;
    private Instant updatedAt;

    public static InventorySyncItem from(InventoryItem item) {
        return InventorySyncItem.builder()
                .id(item.getId())
                .name(item.getName())
                .abcCategory(item.getAbcCategory() != null ? item.getAbcCategory().name() : null)
                .currentStock(item.getCurrentStock())
                .parLevel(item.getParLevel())
                .countUnit(item.getCountUnit())
                .storageLocation(item.getStorageLocation())
                .perishable(item.isPerishable())
                .avgCost(item.getAvgCost())
                .updatedAt(item.getUpdatedAt())
                .build();
    }
}
