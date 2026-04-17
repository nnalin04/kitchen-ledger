package com.kitchenledger.inventory.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "purchase_order_items")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PurchaseOrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "purchase_order_id", nullable = false)
    private UUID purchaseOrderId;

    @Column(name = "inventory_item_id", nullable = false)
    private UUID inventoryItemId;

    @Column(name = "ordered_quantity", nullable = false, precision = 12, scale = 4)
    private BigDecimal orderedQuantity;

    @Column(name = "ordered_unit", nullable = false)
    private String orderedUnit;

    @Column(name = "unit_price", nullable = false, precision = 12, scale = 4)
    private BigDecimal unitPrice;

    /** Computed column — never written by JPA. */
    @Column(name = "line_total", insertable = false, updatable = false, precision = 12, scale = 2)
    private BigDecimal lineTotal;

    @Column(name = "received_quantity", nullable = false, precision = 12, scale = 4)
    @Builder.Default
    private BigDecimal receivedQuantity = BigDecimal.ZERO;

    @Column(name = "invoice_unit_price", precision = 12, scale = 4)
    private BigDecimal invoiceUnitPrice;

    @Column(name = "discrepancy_notes")
    private String discrepancyNotes;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
