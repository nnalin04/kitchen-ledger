package com.kitchenledger.finance.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "daily_sales_reports")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DailySalesReport {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "report_date", nullable = false)
    private LocalDate reportDate;

    @Column(name = "covers_count", nullable = false)
    @Builder.Default
    private int coversCount = 0;

    @Column(name = "gross_sales", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal grossSales = BigDecimal.ZERO;

    @Column(name = "discounts", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal discounts = BigDecimal.ZERO;

    /** Generated column: gross_sales - discounts. Never set directly. */
    @Column(name = "net_sales", insertable = false, updatable = false, precision = 12, scale = 2)
    private BigDecimal netSales;

    @Column(name = "cash_sales", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal cashSales = BigDecimal.ZERO;

    @Column(name = "upi_sales", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal upiSales = BigDecimal.ZERO;

    @Column(name = "card_sales", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal cardSales = BigDecimal.ZERO;

    @Column(name = "other_sales", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal otherSales = BigDecimal.ZERO;

    @Column(name = "vat_collected", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal vatCollected = BigDecimal.ZERO;

    @Column(name = "service_charge_collected", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal serviceChargeCollected = BigDecimal.ZERO;

    @Column(name = "cost_of_goods_sold", nullable = false, precision = 12, scale = 2)
    @Builder.Default
    private BigDecimal costOfGoodsSold = BigDecimal.ZERO;

    @Column(name = "notes")
    private String notes;

    @Column(name = "is_finalized", nullable = false)
    @Builder.Default
    private boolean finalized = false;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "approved_by")
    private UUID approvedBy;

    @Column(name = "finalized_at")
    private Instant finalizedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Version
    @Column(name = "version", nullable = false)
    private int version;

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
