package com.kitchenledger.finance.model;

import com.kitchenledger.finance.model.enums.AccountType;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "accounts")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Account {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "account_code", nullable = false)
    private String accountCode;

    @Column(name = "account_name", nullable = false)
    private String accountName;

    @Enumerated(EnumType.STRING)
    @Column(name = "account_type", nullable = false)
    private AccountType accountType;

    @Column(name = "parent_id")
    private UUID parentId;

    @Column(name = "is_system", nullable = false)
    @Builder.Default
    private boolean system = false;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    @Version
    @Column(name = "version", nullable = false)
    private int version;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
