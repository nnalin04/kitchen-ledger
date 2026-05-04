package com.kitchenledger.inventory.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Data
public class UsageVarianceRequest {

    @NotNull
    private UUID recipeId;

    @NotNull @Min(1)
    private Integer portionsServed;

    @NotNull
    private LocalDate serviceDate;

    @NotNull
    private List<ActualUsageItem> actualUsage;

    @Data
    public static class ActualUsageItem {
        @NotNull
        private UUID itemId;
        @NotNull
        private BigDecimal actualQuantity;
        private String unit;
    }
}
