package com.kitchenledger.finance.model;

import com.kitchenledger.finance.model.enums.PaymentMethod;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "expenses")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Expense {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "expense_date", nullable = false)
    private LocalDate expenseDate;

    @Column(name = "category", nullable = false)
    private String category;

    @Column(name = "description", nullable = false)
    private String description;

    @Column(name = "amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(name = "vendor_id")
    private UUID vendorId;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_method", nullable = false)
    @Builder.Default
    private PaymentMethod paymentMethod = PaymentMethod.cash;

    @Column(name = "reference_number")
    private String referenceNumber;

    @Column(name = "receipt_url")
    private String receiptUrl;

    @Column(name = "is_recurring", nullable = false)
    @Builder.Default
    private boolean recurring = false;

    @Column(name = "account_id")
    private UUID accountId;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "approved_by")
    private UUID approvedBy;

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
