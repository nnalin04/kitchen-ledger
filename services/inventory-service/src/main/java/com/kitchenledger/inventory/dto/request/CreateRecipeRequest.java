package com.kitchenledger.inventory.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

@Data
public class CreateRecipeRequest {

    @NotBlank
    @Size(max = 200)
    private String name;

    private String category;

    @PositiveOrZero
    private BigDecimal menuPrice = BigDecimal.ZERO;

    private BigDecimal servingSize;
    private String servingUnit;
    private Integer prepTimeMinutes;
    private Integer cookTimeMinutes;

    @DecimalMin("0.01")
    @DecimalMax("100.00")
    private BigDecimal yieldPercent = new BigDecimal("100.00");

    private String notes;
    private String imageUrl;

    @NotEmpty
    @Valid
    private List<IngredientRequest> ingredients;

    @Data
    public static class IngredientRequest {
        private UUID inventoryItemId;
        private UUID subRecipeId;

        @Positive
        private BigDecimal quantity;

        @NotBlank
        private String unit;

        @PositiveOrZero
        private BigDecimal wastePercent = BigDecimal.ZERO;

        private int sortOrder = 0;
    }
}
