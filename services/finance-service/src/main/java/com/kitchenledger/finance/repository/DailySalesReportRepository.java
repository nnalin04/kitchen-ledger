package com.kitchenledger.finance.repository;

import com.kitchenledger.finance.model.DailySalesReport;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

public interface DailySalesReportRepository extends JpaRepository<DailySalesReport, UUID> {

    Optional<DailySalesReport> findByTenantIdAndReportDate(UUID tenantId, LocalDate date);

    Optional<DailySalesReport> findByIdAndTenantId(UUID id, UUID tenantId);

    Page<DailySalesReport> findByTenantIdOrderByReportDateDesc(UUID tenantId, Pageable pageable);

    Page<DailySalesReport> findByTenantIdAndReportDateBetweenOrderByReportDateDesc(
            UUID tenantId, LocalDate from, LocalDate to, Pageable pageable);

    @Query("""
        SELECT COALESCE(SUM(d.grossSales), 0)
        FROM DailySalesReport d
        WHERE d.tenantId = :tenantId
          AND d.reportDate BETWEEN :from AND :to
        """)
    BigDecimal sumGrossSalesBetween(
            @Param("tenantId") UUID tenantId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);

    @Query("""
        SELECT COALESCE(SUM(d.netSales), 0)
        FROM DailySalesReport d
        WHERE d.tenantId = :tenantId
          AND d.reportDate BETWEEN :from AND :to
        """)
    BigDecimal sumNetSalesBetween(
            @Param("tenantId") UUID tenantId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);
}
