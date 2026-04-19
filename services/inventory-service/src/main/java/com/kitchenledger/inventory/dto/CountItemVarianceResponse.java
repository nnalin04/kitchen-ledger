package com.kitchenledger.inventory.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
@Builder
public class CountItemVarianceResponse {
    @JsonProperty("inventory_item_id")
    private UUID inventoryItemId;

    @JsonProperty("expected_quantity")
    private BigDecimal expectedQuantity;

    @JsonProperty("counted_quantity")
    private BigDecimal countedQuantity;

    @JsonProperty("variance_quantity")
    private BigDecimal varianceQuantity;

    private String unit;

    @JsonProperty("unit_cost")
    private BigDecimal unitCost;

    @JsonProperty("variance_cost")
    private BigDecimal varianceCost;
}
