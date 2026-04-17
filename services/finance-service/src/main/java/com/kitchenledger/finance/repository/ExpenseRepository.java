package com.kitchenledger.finance.repository;

import com.kitchenledger.finance.model.Expense;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

public interface ExpenseRepository extends JpaRepository<Expense, UUID> {

    Optional<Expense> findByIdAndTenantIdAndDeletedAtIsNull(UUID id, UUID tenantId);

    Page<Expense> findByTenantIdAndDeletedAtIsNullOrderByExpenseDateDesc(UUID tenantId, Pageable pageable);

    Page<Expense> findByTenantIdAndCategoryAndDeletedAtIsNullOrderByExpenseDateDesc(
            UUID tenantId, String category, Pageable pageable);

    Page<Expense> findByTenantIdAndExpenseDateBetweenAndDeletedAtIsNullOrderByExpenseDateDesc(
            UUID tenantId, LocalDate from, LocalDate to, Pageable pageable);

    /** Combined date-range + category filter. */
    Page<Expense> findByTenantIdAndCategoryAndExpenseDateBetweenAndDeletedAtIsNullOrderByExpenseDateDesc(
            UUID tenantId, String category, LocalDate from, LocalDate to, Pageable pageable);

    @Query("""
        SELECT COALESCE(SUM(e.amount), 0)
        FROM Expense e
        WHERE e.tenantId = :tenantId
          AND e.expenseDate BETWEEN :from AND :to
          AND e.deletedAt IS NULL
        """)
    BigDecimal sumAmountBetween(
            @Param("tenantId") UUID tenantId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);

    @Query("""
        SELECT COALESCE(SUM(e.amount), 0)
        FROM Expense e
        WHERE e.tenantId = :tenantId
          AND e.category = :category
          AND e.expenseDate BETWEEN :from AND :to
          AND e.deletedAt IS NULL
        """)
    BigDecimal sumAmountByCategoryBetween(
            @Param("tenantId") UUID tenantId,
            @Param("category") String category,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);
}
