package com.kitchenledger.inventory.model;

import com.kitchenledger.inventory.model.enums.WasteReason;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "waste_logs")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WasteLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "inventory_item_id", nullable = false)
    private UUID inventoryItemId;

    @Column(name = "logged_at", nullable = false)
    @Builder.Default
    private Instant loggedAt = Instant.now();

    @Column(name = "quantity", nullable = false, precision = 12, scale = 4)
    private BigDecimal quantity;

    @Column(name = "unit", nullable = false)
    private String unit;

    @Enumerated(EnumType.STRING)
    @Column(name = "reason", nullable = false)
    private WasteReason reason;

    @Column(name = "station")
    private String station;

    @Column(name = "estimated_cost", precision = 12, scale = 2)
    private BigDecimal estimatedCost;

    @Column(name = "photo_url")
    private String photoUrl;

    @Column(name = "notes")
    private String notes;

    @Column(name = "logged_by", nullable = false)
    private UUID loggedBy;

    @Column(name = "movement_id")
    private UUID movementId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
