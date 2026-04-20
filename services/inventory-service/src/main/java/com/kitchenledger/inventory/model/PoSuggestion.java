package com.kitchenledger.inventory.model;

import com.kitchenledger.inventory.model.enums.PoSuggestionStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "po_suggestions")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PoSuggestion {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "inventory_item_id", nullable = false)
    private UUID inventoryItemId;

    /** Preferred supplier for the item (nullable — manager selects at approval). */
    @Column(name = "supplier_id")
    private UUID supplierId;

    /** Quantity to order: par_level − current_stock (minimum 0). */
    @Column(name = "suggested_quantity", nullable = false, precision = 12, scale = 4)
    private BigDecimal suggestedQuantity;

    /** Stock level at the time the suggestion was generated. */
    @Column(name = "current_stock", nullable = false, precision = 12, scale = 4)
    private BigDecimal currentStock;

    /** PAR level that triggered this suggestion. */
    @Column(name = "par_level", nullable = false, precision = 12, scale = 4)
    private BigDecimal parLevel;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private PoSuggestionStatus status = PoSuggestionStatus.pending;

    /** Set when a manager approves the suggestion. */
    @Column(name = "approved_by")
    private UUID approvedBy;

    /** Set when the suggestion is converted to an actual PO. */
    @Column(name = "converted_po_id")
    private UUID convertedPoId;

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
