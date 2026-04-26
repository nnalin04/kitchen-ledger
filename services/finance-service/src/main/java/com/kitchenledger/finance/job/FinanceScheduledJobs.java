package com.kitchenledger.finance.job;

import com.kitchenledger.finance.client.TenantCurrencyResolver;
import com.kitchenledger.finance.event.FinanceEventPublisher;
import com.kitchenledger.finance.model.Expense;
import com.kitchenledger.finance.model.enums.PaymentStatus;
import com.kitchenledger.finance.repository.DailySalesReportRepository;
import com.kitchenledger.finance.repository.ExpenseRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class FinanceScheduledJobs {

    private final ExpenseRepository expenseRepository;
    private final DailySalesReportRepository dsrRepository;
    private final FinanceEventPublisher eventPublisher;
    private final TenantCurrencyResolver tenantCurrencyResolver;

    /**
     * 8am daily: find expenses due in exactly 3 days and publish a due-alert event.
     * Allows tenants to take action before the expense becomes overdue.
     */
    @Scheduled(cron = "0 0 8 * * *")
    @Transactional
    public void checkPaymentDueAlerts() {
        LocalDate alertDate = LocalDate.now().plusDays(3);
        List<Expense> dueSoon = expenseRepository.findByDueDateAndPaymentStatus(alertDate, PaymentStatus.pending);
        log.info("FinanceScheduledJobs.checkPaymentDueAlerts: {} expense(s) due in 3 days", dueSoon.size());
        int failures = 0;
        for (Expense expense : dueSoon) {
            try {
                String currency = tenantCurrencyResolver.resolve(expense.getTenantId());
                eventPublisher.publishPaymentDue(expense, currency);
            } catch (Exception e) {
                failures++;
                log.error("Failed to publish due alert for expense {}: {}", expense.getId(), e.getMessage());
            }
        }
        log.info("checkPaymentDueAlerts completed: {} processed, {} failed", dueSoon.size(), failures);
    }

    /**
     * 1am daily: mark expenses whose due date has passed (yesterday or earlier) as OVERDUE,
     * then publish an overdue event per expense.
     */
    @Scheduled(cron = "0 0 1 * * *")
    @Transactional
    public void markExpensesOverdue() {
        LocalDate yesterday = LocalDate.now().minusDays(1);
        List<Expense> nowOverdue = expenseRepository.findPendingWithDueDateBefore(yesterday);
        log.info("FinanceScheduledJobs.markExpensesOverdue: {} expense(s) to mark overdue", nowOverdue.size());
        for (Expense expense : nowOverdue) {
            try {
                expense.setPaymentStatus(PaymentStatus.overdue);
                expenseRepository.save(expense);
                String currency = tenantCurrencyResolver.resolve(expense.getTenantId());
                eventPublisher.publishExpenseOverdue(expense, currency);
            } catch (Exception e) {
                log.error("Failed to process overdue for expense {}: {}", expense.getId(), e.getMessage());
            }
        }
    }

    /**
     * Monday 9am: publish a weekly finance summary event for every tenant that had
     * DSR data in the prior 7 days. Consumed by notification-service to send reports.
     */
    @Scheduled(cron = "0 0 9 * * MON")
    public void sendWeeklyFinanceSummary() {
        LocalDate weekEnd = LocalDate.now().minusDays(1);
        LocalDate weekStart = weekEnd.minusDays(6);
        List<UUID> tenants = dsrRepository.findDistinctTenantsWithDsrBetween(weekStart, weekEnd);
        log.info("FinanceScheduledJobs.sendWeeklyFinanceSummary: {} tenants", tenants.size());
        for (UUID tenantId : tenants) {
            try {
                BigDecimal weeklyRevenue = dsrRepository.sumNetSalesBetween(tenantId, weekStart, weekEnd);
                String currency = tenantCurrencyResolver.resolve(tenantId);
                eventPublisher.publishWeeklySummary(tenantId, weeklyRevenue, weekStart, weekEnd, currency);
            } catch (Exception e) {
                log.error("Failed to send weekly summary for tenant {}: {}", tenantId, e.getMessage());
            }
        }
    }
}
