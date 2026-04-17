package com.kitchenledger.finance.repository;

import com.kitchenledger.finance.model.VendorPayment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface VendorPaymentRepository extends JpaRepository<VendorPayment, UUID> {

    Page<VendorPayment> findByTenantIdOrderByPaymentDateDesc(UUID tenantId, Pageable pageable);

    Page<VendorPayment> findByTenantIdAndVendorIdOrderByPaymentDateDesc(
            UUID tenantId, UUID vendorId, Pageable pageable);

    @Query("""
        SELECT COALESCE(SUM(p.amount), 0)
        FROM VendorPayment p
        WHERE p.tenantId = :tenantId
          AND p.vendorId = :vendorId
          AND p.paymentDate BETWEEN :from AND :to
        """)
    BigDecimal sumAmountByVendorBetween(
            @Param("tenantId") UUID tenantId,
            @Param("vendorId") UUID vendorId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);

    /**
     * Tenant-scoped overdue query — safe to call from any context.
     * The scheduler uses {@link #findDistinctTenantsWithOverdue} first to collect tenant IDs,
     * then calls this method per tenant so no cross-tenant data is ever mixed.
     */
    @Query("""
        SELECT vp FROM VendorPayment vp
        WHERE vp.tenantId = :tenantId
          AND vp.paymentStatus = 'pending'
          AND vp.dueDate < :today
        ORDER BY vp.dueDate ASC
        """)
    List<VendorPayment> findOverdue(@Param("tenantId") UUID tenantId, @Param("today") LocalDate today);

    /** Used only by the scheduled job to discover which tenants have overdue payments. */
    @Query("SELECT DISTINCT vp.tenantId FROM VendorPayment vp WHERE vp.paymentStatus = 'pending' AND vp.dueDate < :today")
    List<UUID> findDistinctTenantsWithOverdue(@Param("today") LocalDate today);
}
