package com.kitchenledger.inventory.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class UsageVarianceResponse {

    private UUID id;
    private UUID recipeId;
    private String recipeName;
    private LocalDate serviceDate;
    private int portionsServed;
    private String overallStatus;
    private List<IngredientVariance> ingredients;

    @Data
    @Builder
    public static class IngredientVariance {
        private UUID itemId;
        private String itemName;
        private BigDecimal theoreticalQuantity;
        private BigDecimal actualQuantity;
        private BigDecimal varianceQuantity;
        private BigDecimal variancePercent;
        private String unit;
        private String status;
    }
}
