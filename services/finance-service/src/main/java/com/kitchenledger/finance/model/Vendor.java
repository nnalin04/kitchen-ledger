package com.kitchenledger.finance.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "vendors")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Vendor {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "contact_name")
    private String contactName;

    @Column(name = "email")
    private String email;

    @Column(name = "phone")
    private String phone;

    @Column(name = "gstin")
    private String gstin;

    @Column(name = "payment_terms_days", nullable = false)
    @Builder.Default
    private int paymentTermsDays = 30;

    @Column(name = "outstanding_balance", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal outstandingBalance = BigDecimal.ZERO;

    @Column(name = "notes")
    private String notes;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

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
