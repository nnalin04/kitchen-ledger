package com.kitchenledger.inventory.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "recipe_ingredients")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RecipeIngredient {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "recipe_id", nullable = false)
    private UUID recipeId;

    /** Exactly one of inventoryItemId or subRecipeId must be non-null. */
    @Column(name = "inventory_item_id")
    private UUID inventoryItemId;

    @Column(name = "sub_recipe_id")
    private UUID subRecipeId;

    @Column(name = "quantity", nullable = false, precision = 12, scale = 4)
    private BigDecimal quantity;

    @Column(name = "unit", nullable = false)
    private String unit;

    @Column(name = "waste_percent", nullable = false, precision = 5, scale = 2)
    @Builder.Default
    private BigDecimal wastePercent = BigDecimal.ZERO;

    @Column(name = "unit_cost", nullable = false, precision = 12, scale = 4)
    @Builder.Default
    private BigDecimal unitCost = BigDecimal.ZERO;

    @Column(name = "line_cost", nullable = false, precision = 12, scale = 4)
    @Builder.Default
    private BigDecimal lineCost = BigDecimal.ZERO;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;

    public void recalculateLineCost() {
        // line_cost = quantity * unit_cost * (1 + waste_percent / 100)
        BigDecimal wasteMultiplier = BigDecimal.ONE.add(
                wastePercent.divide(new BigDecimal("100"), 6, java.math.RoundingMode.HALF_UP));
        this.lineCost = quantity
                .multiply(unitCost)
                .multiply(wasteMultiplier)
                .setScale(4, java.math.RoundingMode.HALF_UP);
    }
}
