package com.kitchenledger.inventory.model;

import com.kitchenledger.inventory.model.enums.MovementType;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Append-only stock ledger — rows are NEVER updated or deleted.
 * All stock changes create a new movement record.
 */
@Entity
@Table(name = "inventory_movements")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryMovement {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "inventory_item_id", nullable = false)
    private UUID inventoryItemId;

    @Enumerated(EnumType.STRING)
    @Column(name = "movement_type", nullable = false)
    private MovementType movementType;

    /** Positive = stock increase, Negative = stock decrease */
    @Column(name = "quantity_delta", nullable = false, precision = 12, scale = 4)
    private BigDecimal quantityDelta;

    @Column(name = "unit", nullable = false)
    private String unit;

    @Column(name = "unit_cost", precision = 12, scale = 4)
    private BigDecimal unitCost;

    @Column(name = "reference_id")
    private UUID referenceId;

    @Column(name = "reference_type")
    private String referenceType;

    @Column(name = "notes")
    private String notes;

    @Column(name = "performed_by", nullable = false)
    private UUID performedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
