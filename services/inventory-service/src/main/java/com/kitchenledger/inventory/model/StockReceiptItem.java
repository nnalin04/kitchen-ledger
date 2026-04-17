package com.kitchenledger.inventory.model;

import com.kitchenledger.inventory.model.enums.StockItemCondition;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "stock_receipt_items")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StockReceiptItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "stock_receipt_id", nullable = false)
    private UUID stockReceiptId;

    @Column(name = "inventory_item_id", nullable = false)
    private UUID inventoryItemId;

    @Column(name = "expected_quantity", precision = 12, scale = 4)
    private BigDecimal expectedQuantity;

    @Column(name = "received_quantity", nullable = false, precision = 12, scale = 4)
    private BigDecimal receivedQuantity;

    @Column(name = "unit", nullable = false)
    private String unit;

    @Column(name = "unit_cost", nullable = false, precision = 12, scale = 4)
    private BigDecimal unitCost;

    @Column(name = "expiry_date")
    private LocalDate expiryDate;

    @Column(name = "batch_number")
    private String batchNumber;

    @Column(name = "storage_location")
    private String storageLocation;

    @Enumerated(EnumType.STRING)
    @Column(name = "condition", nullable = false)
    @Builder.Default
    private StockItemCondition condition = StockItemCondition.good;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
