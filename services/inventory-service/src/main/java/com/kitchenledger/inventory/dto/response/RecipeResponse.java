package com.kitchenledger.inventory.dto.response;

import com.kitchenledger.inventory.model.Recipe;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class RecipeResponse {

    private UUID id;
    private UUID tenantId;
    private String name;
    private String category;
    private BigDecimal menuPrice;
    private BigDecimal servingSize;
    private String servingUnit;
    private Integer prepTimeMinutes;
    private Integer cookTimeMinutes;
    private BigDecimal yieldPercent;
    private BigDecimal totalCost;
    private BigDecimal foodCostPercent;
    private String menuMatrixCategory;
    private boolean active;
    private String notes;
    private String imageUrl;
    private List<IngredientResponse> ingredients;
    private Instant createdAt;
    private Instant updatedAt;

    @Data
    @Builder
    public static class IngredientResponse {
        private UUID id;
        private UUID inventoryItemId;
        private UUID subRecipeId;
        private BigDecimal quantity;
        private String unit;
        private BigDecimal wastePercent;
        private BigDecimal unitCost;
        private BigDecimal lineCost;
        private int sortOrder;
    }

    public static RecipeResponse from(Recipe recipe) {
        List<IngredientResponse> ingredientResponses = recipe.getIngredients().stream()
                .map(ing -> IngredientResponse.builder()
                        .id(ing.getId())
                        .inventoryItemId(ing.getInventoryItemId())
                        .subRecipeId(ing.getSubRecipeId())
                        .quantity(ing.getQuantity())
                        .unit(ing.getUnit())
                        .wastePercent(ing.getWastePercent())
                        .unitCost(ing.getUnitCost())
                        .lineCost(ing.getLineCost())
                        .sortOrder(ing.getSortOrder())
                        .build())
                .toList();

        return RecipeResponse.builder()
                .id(recipe.getId())
                .tenantId(recipe.getTenantId())
                .name(recipe.getName())
                .category(recipe.getCategory())
                .menuPrice(recipe.getMenuPrice())
                .servingSize(recipe.getServingSize())
                .servingUnit(recipe.getServingUnit())
                .prepTimeMinutes(recipe.getPrepTimeMinutes())
                .cookTimeMinutes(recipe.getCookTimeMinutes())
                .yieldPercent(recipe.getYieldPercent())
                .totalCost(recipe.getTotalCost())
                .foodCostPercent(recipe.getFoodCostPercent())
                .menuMatrixCategory(recipe.getMenuMatrixCategory())
                .active(recipe.isActive())
                .notes(recipe.getNotes())
                .imageUrl(recipe.getImageUrl())
                .ingredients(ingredientResponses)
                .createdAt(recipe.getCreatedAt())
                .updatedAt(recipe.getUpdatedAt())
                .build();
    }
}
