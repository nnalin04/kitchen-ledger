package com.kitchenledger.inventory.model;

import com.kitchenledger.inventory.model.enums.AbcCategory;
import com.kitchenledger.inventory.model.enums.CountStatus;
import com.kitchenledger.inventory.model.enums.CountType;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "inventory_counts")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryCount {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Enumerated(EnumType.STRING)
    @Column(name = "count_type", nullable = false)
    private CountType countType;

    @Enumerated(EnumType.STRING)
    @Column(name = "abc_filter")
    private AbcCategory abcFilter;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private CountStatus status;

    @Column(name = "count_date", nullable = false)
    private LocalDate countDate;

    @CreationTimestamp
    @Column(name = "started_at", nullable = false, updatable = false)
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "verified_at")
    private Instant verifiedAt;

    @Column(name = "counted_by", nullable = false)
    private UUID countedBy;

    @Column(name = "verified_by")
    private UUID verifiedBy;

    @Column(name = "notes")
    private String notes;

    @Column(name = "total_variance_cost")
    private BigDecimal totalVarianceCost;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @OneToMany(mappedBy = "inventoryCount", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    @ToString.Exclude
    private List<InventoryCountItem> items = new ArrayList<>();

    public void addItem(InventoryCountItem item) {
        items.add(item);
        item.setInventoryCount(this);
    }
}
