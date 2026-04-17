package com.kitchenledger.inventory.model;

import com.kitchenledger.inventory.model.enums.AbcCategory;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "inventory_items")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "category_id")
    private UUID categoryId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "sku")
    private String sku;

    @Column(name = "barcode")
    private String barcode;

    @Column(name = "description")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(name = "abc_category", nullable = false)
    @Builder.Default
    private AbcCategory abcCategory = AbcCategory.C;

    @Column(name = "abc_override", nullable = false)
    @Builder.Default
    private boolean abcOverride = false;

    // ── Unit system ──────────────────────────────────────────────

    @Column(name = "purchase_unit", nullable = false)
    private String purchaseUnit;

    @Column(name = "purchase_unit_qty", nullable = false, precision = 10, scale = 4)
    @Builder.Default
    private BigDecimal purchaseUnitQty = BigDecimal.ONE;

    @Column(name = "recipe_unit", nullable = false)
    private String recipeUnit;

    @Column(name = "count_unit", nullable = false)
    private String countUnit;

    @Column(name = "purchase_to_recipe_factor", nullable = false, precision = 10, scale = 6)
    @Builder.Default
    private BigDecimal purchaseToRecipeFactor = BigDecimal.ONE;

    @Column(name = "recipe_to_count_factor", nullable = false, precision = 10, scale = 6)
    @Builder.Default
    private BigDecimal recipeToCountFactor = BigDecimal.ONE;

    // ── Stock ────────────────────────────────────────────────────

    @Column(name = "current_stock", nullable = false, precision = 12, scale = 4)
    @Builder.Default
    private BigDecimal currentStock = BigDecimal.ZERO;

    @Column(name = "par_level", precision = 12, scale = 4)
    private BigDecimal parLevel;

    @Column(name = "reorder_quantity", precision = 12, scale = 4)
    private BigDecimal reorderQuantity;

    @Column(name = "safety_stock", nullable = false, precision = 12, scale = 4)
    @Builder.Default
    private BigDecimal safetyStock = BigDecimal.ZERO;

    // ── Cost ─────────────────────────────────────────────────────

    @Column(name = "avg_cost", nullable = false, precision = 12, scale = 4)
    @Builder.Default
    private BigDecimal avgCost = BigDecimal.ZERO;

    @Column(name = "last_purchase_price", precision = 12, scale = 4)
    private BigDecimal lastPurchasePrice;

    @Column(name = "price_alert_threshold", nullable = false, precision = 5, scale = 2)
    @Builder.Default
    private BigDecimal priceAlertThreshold = new BigDecimal("10.00");

    // ── Perishability ────────────────────────────────────────────

    @Column(name = "is_perishable", nullable = false)
    @Builder.Default
    private boolean perishable = false;

    @Column(name = "shelf_life_days")
    private Integer shelfLifeDays;

    @Column(name = "expiry_alert_days", nullable = false)
    @Builder.Default
    private int expiryAlertDays = 2;

    @Column(name = "storage_location")
    private String storageLocation;

    @Column(name = "primary_supplier_id")
    private UUID primarySupplierId;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(name = "notes")
    private String notes;

    @Column(name = "image_url")
    private String imageUrl;

    @Version
    @Column(name = "version", nullable = false)
    @Builder.Default
    private int version = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
        if (updatedAt == null) updatedAt = Instant.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public boolean isBelowPar() {
        return parLevel != null && currentStock.compareTo(parLevel) < 0;
    }
}
