package com.kitchenledger.finance.repository;

import com.kitchenledger.finance.model.Expense;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.kitchenledger.finance.model.enums.PaymentStatus;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
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

    /**
     * Expenses with a specific due date and payment status (used by FinanceScheduledJobs
     * to find expenses due in N days for alerting).
     */
    List<Expense> findByDueDateAndPaymentStatus(LocalDate dueDate, PaymentStatus paymentStatus);

    /**
     * Expenses that are still pending but whose due date has passed (used to mark overdue).
     */
    @Query("""
        SELECT e FROM Expense e
        WHERE e.dueDate < :date
          AND e.paymentStatus = com.kitchenledger.finance.model.enums.PaymentStatus.pending
          AND e.deletedAt IS NULL
        """)
    List<Expense> findPendingWithDueDateBefore(@Param("date") LocalDate date);

    /**
     * Per-account breakdown: returns rows of [accountName, sum] ordered by amount desc.
     * Used by P&L report for detailed line-item sections.
     */
    @Query("""
        SELECT a.accountName, COALESCE(SUM(e.amount), 0)
        FROM Expense e
        JOIN Account a ON e.accountId = a.id
        WHERE e.tenantId = :tenantId
          AND e.expenseDate BETWEEN :from AND :to
          AND e.deletedAt IS NULL
          AND a.deletedAt IS NULL
        GROUP BY a.id, a.accountName
        ORDER BY SUM(e.amount) DESC
        """)
    List<Object[]> sumByAccountBetween(
            @Param("tenantId") UUID tenantId,
            @Param("from") LocalDate from,
            @Param("to") LocalDate to);
}
