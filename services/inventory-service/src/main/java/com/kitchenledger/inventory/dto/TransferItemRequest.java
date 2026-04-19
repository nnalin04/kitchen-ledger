package com.kitchenledger.inventory.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class TransferItemRequest {
    @NotNull
    @JsonProperty("inventory_item_id")
    private UUID inventoryItemId;

    @NotNull
    private BigDecimal quantity;
}
