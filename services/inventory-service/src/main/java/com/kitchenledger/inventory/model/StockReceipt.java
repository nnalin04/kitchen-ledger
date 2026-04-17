package com.kitchenledger.inventory.model;

import com.kitchenledger.inventory.model.enums.ThreeWayMatchStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "stock_receipts")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StockReceipt {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "purchase_order_id")
    private UUID purchaseOrderId;

    @Column(name = "supplier_id")
    private UUID supplierId;

    @Column(name = "receipt_date", nullable = false)
    @Builder.Default
    private LocalDate receiptDate = LocalDate.now();

    @Column(name = "invoice_number")
    private String invoiceNumber;

    @Column(name = "invoice_date")
    private LocalDate invoiceDate;

    @Column(name = "invoice_amount", precision = 12, scale = 2)
    private BigDecimal invoiceAmount;

    @Column(name = "invoice_image_url")
    private String invoiceImageUrl;

    @Enumerated(EnumType.STRING)
    @Column(name = "three_way_match_status", nullable = false)
    @Builder.Default
    private ThreeWayMatchStatus threeWayMatchStatus = ThreeWayMatchStatus.pending;

    @Column(name = "match_notes")
    private String matchNotes;

    @Column(name = "received_by", nullable = false)
    private UUID receivedBy;

    @Column(name = "is_confirmed", nullable = false)
    @Builder.Default
    private boolean confirmed = false;

    @Column(name = "confirmed_at")
    private Instant confirmedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @OneToMany(cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @JoinColumn(name = "stock_receipt_id")
    @Builder.Default
    private List<StockReceiptItem> items = new ArrayList<>();

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
