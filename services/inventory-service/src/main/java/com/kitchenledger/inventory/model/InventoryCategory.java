package com.kitchenledger.inventory.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "inventory_categories")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class InventoryCategory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "parent_id")
    private UUID parentId;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private int sortOrder = 0;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
