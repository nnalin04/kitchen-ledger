package com.kitchenledger.inventory.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class CountItemRequest {
    @NotNull
    @JsonProperty("inventory_item_id")
    private UUID inventoryItemId;

    @NotNull
    @JsonProperty("counted_quantity")
    private BigDecimal countedQuantity;

    private String unit;
    private String notes;
}
