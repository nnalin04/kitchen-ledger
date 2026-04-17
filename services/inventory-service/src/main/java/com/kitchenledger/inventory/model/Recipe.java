package com.kitchenledger.inventory.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "recipes")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Recipe {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "category")
    private String category;

    @Column(name = "menu_price", nullable = false, precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal menuPrice = BigDecimal.ZERO;

    @Column(name = "serving_size", precision = 10, scale = 3)
    private BigDecimal servingSize;

    @Column(name = "serving_unit")
    private String servingUnit;

    @Column(name = "prep_time_minutes")
    private Integer prepTimeMinutes;

    @Column(name = "cook_time_minutes")
    private Integer cookTimeMinutes;

    @Column(name = "yield_percent", nullable = false, precision = 5, scale = 2)
    @Builder.Default
    private BigDecimal yieldPercent = new BigDecimal("100.00");

    @Column(name = "total_cost", nullable = false, precision = 10, scale = 4)
    @Builder.Default
    private BigDecimal totalCost = BigDecimal.ZERO;

    @Column(name = "food_cost_percent", nullable = false, precision = 5, scale = 2)
    @Builder.Default
    private BigDecimal foodCostPercent = BigDecimal.ZERO;

    @Column(name = "menu_matrix_category")
    private String menuMatrixCategory;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(name = "notes")
    private String notes;

    @Column(name = "image_url")
    private String imageUrl;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @JoinColumn(name = "recipe_id")
    @Builder.Default
    private List<RecipeIngredient> ingredients = new ArrayList<>();

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
        if (updatedAt == null) updatedAt = Instant.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    /** Recalculates total_cost and food_cost_percent from ingredient line costs. */
    public void recalculateCost() {
        this.totalCost = ingredients.stream()
                .map(RecipeIngredient::getLineCost)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        if (menuPrice != null && menuPrice.compareTo(BigDecimal.ZERO) > 0) {
            this.foodCostPercent = totalCost
                    .multiply(new BigDecimal("100"))
                    .divide(menuPrice, 2, java.math.RoundingMode.HALF_UP);
        }
    }
}
