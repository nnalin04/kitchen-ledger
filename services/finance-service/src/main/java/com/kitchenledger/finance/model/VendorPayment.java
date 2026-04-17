package com.kitchenledger.finance.model;

import com.kitchenledger.finance.model.enums.PaymentMethod;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "vendor_payments")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class VendorPayment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "vendor_id", nullable = false)
    private UUID vendorId;

    @Column(name = "expense_id")
    private UUID expenseId;

    @Column(name = "payment_date", nullable = false)
    private LocalDate paymentDate;

    @Column(name = "amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_method", nullable = false)
    @Builder.Default
    private PaymentMethod paymentMethod = PaymentMethod.cash;

    @Column(name = "reference_number")
    private String referenceNumber;

    @Column(name = "notes")
    private String notes;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "due_date")
    private LocalDate dueDate;

    @Column(name = "payment_status", nullable = false)
    @Builder.Default
    private String paymentStatus = "paid"; // "pending" | "paid" | "overdue"

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
