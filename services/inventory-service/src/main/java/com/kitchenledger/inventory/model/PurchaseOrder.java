package com.kitchenledger.inventory.model;

import com.kitchenledger.inventory.model.enums.PurchaseOrderStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "purchase_orders")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PurchaseOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "po_number", nullable = false)
    private String poNumber;

    @Column(name = "supplier_id", nullable = false)
    private UUID supplierId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private PurchaseOrderStatus status = PurchaseOrderStatus.draft;

    @Column(name = "order_date", nullable = false)
    @Builder.Default
    private LocalDate orderDate = LocalDate.now();

    @Column(name = "expected_delivery_date")
    private LocalDate expectedDeliveryDate;

    @Column(name = "actual_delivery_date")
    private LocalDate actualDeliveryDate;

    @Column(name = "subtotal", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal subtotal = BigDecimal.ZERO;

    @Column(name = "tax_amount", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal taxAmount = BigDecimal.ZERO;

    @Column(name = "total_amount", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal totalAmount = BigDecimal.ZERO;

    @Column(name = "notes")
    private String notes;

    @Column(name = "sent_via")
    private String sentVia;

    @Column(name = "sent_at")
    private Instant sentAt;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "received_by")
    private UUID receivedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @JoinColumn(name = "purchase_order_id")
    @Builder.Default
    private List<PurchaseOrderItem> items = new ArrayList<>();

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
        if (updatedAt == null) updatedAt = Instant.now();
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public void recalculateTotals() {
        this.subtotal = items.stream()
                .map(i -> i.getOrderedQuantity().multiply(i.getUnitPrice()))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        this.totalAmount = this.subtotal.add(this.taxAmount);
    }
}
