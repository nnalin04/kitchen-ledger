package com.kitchenledger.inventory.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
    name = "inventory_item_suppliers",
    uniqueConstraints = @UniqueConstraint(
        name = "uq_item_supplier",
        columnNames = {"tenant_id", "inventory_item_id", "supplier_id"}
    )
)
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryItemSupplier {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "inventory_item_id", nullable = false)
    private UUID inventoryItemId;

    @Column(name = "supplier_id", nullable = false)
    private UUID supplierId;

    @Column(name = "unit_price", nullable = false, precision = 12, scale = 4)
    @Builder.Default
    private BigDecimal unitPrice = BigDecimal.ZERO;

    @Column(name = "is_preferred", nullable = false)
    @Builder.Default
    private boolean preferred = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
        if (updatedAt == null) updatedAt = Instant.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }
}
