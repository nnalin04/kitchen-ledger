package com.kitchenledger.inventory.dto.response;

import com.kitchenledger.inventory.model.InventoryItemSupplier;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Data
@Builder
public class ItemSupplierResponse {

    private UUID id;
    private UUID tenantId;
    private UUID inventoryItemId;
    private UUID supplierId;
    private BigDecimal unitPrice;
    private boolean preferred;
    private Instant createdAt;
    private Instant updatedAt;

    public static ItemSupplierResponse from(InventoryItemSupplier entity) {
        return ItemSupplierResponse.builder()
                .id(entity.getId())
                .tenantId(entity.getTenantId())
                .inventoryItemId(entity.getInventoryItemId())
                .supplierId(entity.getSupplierId())
                .unitPrice(entity.getUnitPrice())
                .preferred(entity.isPreferred())
                .createdAt(entity.getCreatedAt())
                .updatedAt(entity.getUpdatedAt())
                .build();
    }
}
