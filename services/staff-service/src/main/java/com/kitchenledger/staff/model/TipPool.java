package com.kitchenledger.staff.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "tip_pools")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TipPool {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "pool_date", nullable = false)
    private LocalDate poolDate;

    @Column(name = "total_amount", nullable = false, precision = 10, scale = 2)
    @Builder.Default
    private BigDecimal totalAmount = BigDecimal.ZERO;

    @Column(name = "distribution_method", nullable = false)
    @Builder.Default
    private String distributionMethod = "equal";

    @Column(name = "is_distributed", nullable = false)
    @Builder.Default
    private boolean distributed = false;

    @Column(name = "distributed_at")
    private Instant distributedAt;

    @Column(name = "notes")
    private String notes;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
