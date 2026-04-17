package com.kitchenledger.inventory.dto.response;

import com.kitchenledger.inventory.model.WasteLog;
import com.kitchenledger.inventory.model.enums.WasteReason;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Data
@Builder
public class WasteLogResponse {

    private UUID id;
    private UUID tenantId;
    private UUID inventoryItemId;
    private String itemName;          // populated by internal endpoints via join
    private Instant loggedAt;
    private BigDecimal quantity;
    private String unit;
    private WasteReason reason;
    private String station;
    private BigDecimal estimatedCost;
    private String photoUrl;
    private String notes;
    private UUID loggedBy;
    private UUID movementId;
    private Instant createdAt;

    public static WasteLogResponse from(WasteLog log) {
        return WasteLogResponse.builder()
                .id(log.getId())
                .tenantId(log.getTenantId())
                .inventoryItemId(log.getInventoryItemId())
                .loggedAt(log.getLoggedAt())
                .quantity(log.getQuantity())
                .unit(log.getUnit())
                .reason(log.getReason())
                .station(log.getStation())
                .estimatedCost(log.getEstimatedCost())
                .photoUrl(log.getPhotoUrl())
                .notes(log.getNotes())
                .loggedBy(log.getLoggedBy())
                .movementId(log.getMovementId())
                .createdAt(log.getCreatedAt())
                .build();
    }
}
