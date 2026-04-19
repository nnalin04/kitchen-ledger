package com.kitchenledger.inventory.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
@Builder
public class CountVarianceResponse {
    @JsonProperty("inventory_count")
    private InventoryCountResponse inventoryCount;

    @JsonProperty("total_variance_cost")
    private BigDecimal totalVarianceCost;

    private List<CountItemVarianceResponse> items;
}
