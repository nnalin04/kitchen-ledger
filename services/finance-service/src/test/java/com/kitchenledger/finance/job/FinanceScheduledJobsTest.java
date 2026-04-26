package com.kitchenledger.finance.job;

import com.kitchenledger.finance.client.TenantCurrencyResolver;
import com.kitchenledger.finance.event.FinanceEventPublisher;
import com.kitchenledger.finance.model.Expense;
import com.kitchenledger.finance.model.enums.PaymentStatus;
import com.kitchenledger.finance.repository.DailySalesReportRepository;
import com.kitchenledger.finance.repository.ExpenseRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FinanceScheduledJobsTest {

    @Mock private ExpenseRepository expenseRepository;
    @Mock private DailySalesReportRepository dsrRepository;
    @Mock private FinanceEventPublisher eventPublisher;
    @Mock private TenantCurrencyResolver tenantCurrencyResolver;

    @InjectMocks
    private FinanceScheduledJobs jobs;

    private Expense pendingExpense(UUID tenantId, LocalDate dueDate) {
        return Expense.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .expenseDate(LocalDate.now().minusDays(1))
                .category("food")
                .description("Test expense")
                .amount(new BigDecimal("1500.00"))
                .dueDate(dueDate)
                .paymentStatus(PaymentStatus.pending)
                .createdBy(UUID.randomUUID())
                .build();
    }

    // ── checkPaymentDueAlerts ─────────────────────────────────────────────────

    @Test
    void checkPaymentDueAlerts_expenseDueIn3Days_publishesDueEvent() {
        UUID tenantId = UUID.randomUUID();
        LocalDate in3Days = LocalDate.now().plusDays(3);
        Expense expense = pendingExpense(tenantId, in3Days);

        when(expenseRepository.findByDueDateAndPaymentStatus(in3Days, PaymentStatus.pending))
                .thenReturn(List.of(expense));
        when(tenantCurrencyResolver.resolve(tenantId)).thenReturn("INR");

        jobs.checkPaymentDueAlerts();

        verify(eventPublisher).publishPaymentDue(expense, "INR");
    }

    @Test
    void checkPaymentDueAlerts_noExpensesDueSoon_noEventPublished() {
        when(expenseRepository.findByDueDateAndPaymentStatus(any(LocalDate.class), eq(PaymentStatus.pending)))
                .thenReturn(List.of());

        jobs.checkPaymentDueAlerts();

        verify(eventPublisher, never()).publishPaymentDue(any(), any());
    }

    @Test
    void checkPaymentDueAlerts_oneFailure_doesNotAbortOthers() {
        UUID tenant1 = UUID.randomUUID();
        UUID tenant2 = UUID.randomUUID();
        LocalDate in3Days = LocalDate.now().plusDays(3);
        Expense expense1 = pendingExpense(tenant1, in3Days);
        Expense expense2 = pendingExpense(tenant2, in3Days);

        when(expenseRepository.findByDueDateAndPaymentStatus(in3Days, PaymentStatus.pending))
                .thenReturn(List.of(expense1, expense2));
        when(tenantCurrencyResolver.resolve(tenant1)).thenThrow(new RuntimeException("resolver down"));
        when(tenantCurrencyResolver.resolve(tenant2)).thenReturn("USD");

        // Must not throw
        jobs.checkPaymentDueAlerts();

        verify(eventPublisher, never()).publishPaymentDue(eq(expense1), any());
        verify(eventPublisher).publishPaymentDue(expense2, "USD");
    }

    // ── markExpensesOverdue ───────────────────────────────────────────────────

    @Test
    void markExpensesOverdue_pendingExpirePastDue_marksOverdueAndPublishesEvent() {
        UUID tenantId = UUID.randomUUID();
        Expense expense = pendingExpense(tenantId, LocalDate.now().minusDays(2));

        when(expenseRepository.findPendingWithDueDateBefore(LocalDate.now().minusDays(1)))
                .thenReturn(List.of(expense));
        when(expenseRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(tenantCurrencyResolver.resolve(tenantId)).thenReturn("INR");

        jobs.markExpensesOverdue();

        ArgumentCaptor<Expense> captor = ArgumentCaptor.forClass(Expense.class);
        verify(expenseRepository).save(captor.capture());
        assertThat(captor.getValue().getPaymentStatus()).isEqualTo(PaymentStatus.overdue);

        verify(eventPublisher).publishExpenseOverdue(expense, "INR");
    }

    @Test
    void markExpensesOverdue_noPendingExpired_nothingHappens() {
        when(expenseRepository.findPendingWithDueDateBefore(any(LocalDate.class)))
                .thenReturn(List.of());

        jobs.markExpensesOverdue();

        verify(expenseRepository, never()).save(any());
        verify(eventPublisher, never()).publishExpenseOverdue(any(Expense.class), any());
    }

    @Test
    void markExpensesOverdue_oneFailure_continuesProcessingRemainder() {
        UUID tenant1 = UUID.randomUUID();
        UUID tenant2 = UUID.randomUUID();
        Expense expense1 = pendingExpense(tenant1, LocalDate.now().minusDays(2));
        Expense expense2 = pendingExpense(tenant2, LocalDate.now().minusDays(2));

        when(expenseRepository.findPendingWithDueDateBefore(any(LocalDate.class)))
                .thenReturn(List.of(expense1, expense2));
        when(expenseRepository.save(eq(expense1))).thenThrow(new RuntimeException("db error"));
        when(expenseRepository.save(eq(expense2))).thenAnswer(inv -> inv.getArgument(0));
        when(tenantCurrencyResolver.resolve(tenant2)).thenReturn("INR");

        // Must not throw
        jobs.markExpensesOverdue();

        verify(expenseRepository).save(expense2);
        verify(eventPublisher).publishExpenseOverdue(expense2, "INR");
        verify(eventPublisher, never()).publishExpenseOverdue(eq(expense1), any());
    }

    // ── sendWeeklyFinanceSummary ──────────────────────────────────────────────

    @Test
    void sendWeeklyFinanceSummary_twoTenantsWithData_publishesTwoSummaryEvents() {
        UUID tenant1 = UUID.randomUUID();
        UUID tenant2 = UUID.randomUUID();
        LocalDate weekEnd = LocalDate.now().minusDays(1);
        LocalDate weekStart = weekEnd.minusDays(6);

        when(dsrRepository.findDistinctTenantsWithDsrBetween(weekStart, weekEnd))
                .thenReturn(List.of(tenant1, tenant2));
        when(dsrRepository.sumNetSalesBetween(eq(tenant1), any(), any()))
                .thenReturn(new BigDecimal("45000.00"));
        when(dsrRepository.sumNetSalesBetween(eq(tenant2), any(), any()))
                .thenReturn(new BigDecimal("32000.00"));
        when(tenantCurrencyResolver.resolve(tenant1)).thenReturn("INR");
        when(tenantCurrencyResolver.resolve(tenant2)).thenReturn("INR");

        jobs.sendWeeklyFinanceSummary();

        verify(eventPublisher).publishWeeklySummary(
                eq(tenant1), eq(new BigDecimal("45000.00")), any(), any(), eq("INR"));
        verify(eventPublisher).publishWeeklySummary(
                eq(tenant2), eq(new BigDecimal("32000.00")), any(), any(), eq("INR"));
    }

    @Test
    void sendWeeklyFinanceSummary_noTenantsWithData_noEventsPublished() {
        when(dsrRepository.findDistinctTenantsWithDsrBetween(any(), any()))
                .thenReturn(List.of());

        jobs.sendWeeklyFinanceSummary();

        verify(eventPublisher, never()).publishWeeklySummary(any(), any(), any(), any(), any());
    }

    @Test
    void sendWeeklyFinanceSummary_oneFailure_continuesOtherTenants() {
        UUID tenant1 = UUID.randomUUID();
        UUID tenant2 = UUID.randomUUID();
        LocalDate weekEnd = LocalDate.now().minusDays(1);
        LocalDate weekStart = weekEnd.minusDays(6);

        when(dsrRepository.findDistinctTenantsWithDsrBetween(weekStart, weekEnd))
                .thenReturn(List.of(tenant1, tenant2));
        when(dsrRepository.sumNetSalesBetween(eq(tenant1), any(), any()))
                .thenThrow(new RuntimeException("db error"));
        when(dsrRepository.sumNetSalesBetween(eq(tenant2), any(), any()))
                .thenReturn(new BigDecimal("20000.00"));
        when(tenantCurrencyResolver.resolve(tenant2)).thenReturn("USD");

        // Must not throw
        jobs.sendWeeklyFinanceSummary();

        verify(eventPublisher, never()).publishWeeklySummary(eq(tenant1), any(), any(), any(), any());
        verify(eventPublisher).publishWeeklySummary(eq(tenant2), any(), any(), any(), eq("USD"));
    }
}
