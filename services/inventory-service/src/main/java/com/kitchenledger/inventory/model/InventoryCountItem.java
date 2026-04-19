package com.kitchenledger.inventory.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "inventory_count_items")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryCountItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "inventory_count_id", nullable = false)
    @ToString.Exclude
    private InventoryCount inventoryCount;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "inventory_item_id", nullable = false)
    private InventoryItem inventoryItem;

    @Column(name = "expected_quantity", nullable = false)
    private BigDecimal expectedQuantity;

    @Column(name = "counted_quantity")
    private BigDecimal countedQuantity;

    @Column(name = "unit", nullable = false)
    private String unit;

    @Column(name = "unit_cost", nullable = false)
    private BigDecimal unitCost;

    @Column(name = "variance_quantity", insertable = false, updatable = false)
    private BigDecimal varianceQuantity;

    @Column(name = "variance_cost")
    private BigDecimal varianceCost;

    @Column(name = "notes")
    private String notes;

    @Column(name = "counted_at")
    private Instant countedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
