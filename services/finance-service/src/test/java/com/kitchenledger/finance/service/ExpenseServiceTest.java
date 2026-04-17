package com.kitchenledger.finance.service;

import com.kitchenledger.finance.event.FinanceEventPublisher;
import com.kitchenledger.finance.model.Expense;
import com.kitchenledger.finance.model.enums.PaymentMethod;
import com.kitchenledger.finance.repository.ExpenseRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ExpenseServiceTest {

    @Mock
    private ExpenseRepository expenseRepository;

    @Mock
    private FinanceEventPublisher eventPublisher;

    @InjectMocks
    private ExpenseService expenseService;

    private final UUID tenantId = UUID.randomUUID();

    // ── createFromOcr ─────────────────────────────────────────────────────────

    @Test
    void createFromOcr_createsExpenseWithOcrPrefix() {
        when(expenseRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        expenseService.createFromOcr(tenantId, Map.of(
                "result", Map.of(
                        "vendor_name",  "Fresh Mart",
                        "total_amount", "1500.00",
                        "date",         "2026-04-10",
                        "category",     "produce",
                        "file_url",     "https://storage/receipt.jpg"
                )
        ));

        ArgumentCaptor<Expense> captor = ArgumentCaptor.forClass(Expense.class);
        verify(expenseRepository).save(captor.capture());

        Expense saved = captor.getValue();
        assertThat(saved.getDescription()).startsWith("[OCR]");
        assertThat(saved.getDescription()).contains("Fresh Mart");
        assertThat(saved.getAmount()).isEqualByComparingTo(new BigDecimal("1500.00"));
        assertThat(saved.getExpenseDate()).isEqualTo(LocalDate.of(2026, 4, 10));
        assertThat(saved.getCategory()).isEqualTo("produce");
        assertThat(saved.getReceiptUrl()).isEqualTo("https://storage/receipt.jpg");
        assertThat(saved.getPaymentMethod()).isEqualTo(PaymentMethod.cash);
        assertThat(saved.getTenantId()).isEqualTo(tenantId);
        // System user — nil UUID
        assertThat(saved.getCreatedBy()).isEqualTo(new UUID(0L, 0L));
    }

    @Test
    void createFromOcr_missingDate_defaultsToToday() {
        when(expenseRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        expenseService.createFromOcr(tenantId, Map.of(
                "result", Map.of(
                        "total_amount", "500"
                )
        ));

        ArgumentCaptor<Expense> captor = ArgumentCaptor.forClass(Expense.class);
        verify(expenseRepository).save(captor.capture());

        assertThat(captor.getValue().getExpenseDate()).isEqualTo(LocalDate.now());
    }

    @Test
    void createFromOcr_missingCategory_defaultsToOther() {
        when(expenseRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        expenseService.createFromOcr(tenantId, Map.of(
                "result", Map.of("total_amount", "100")
        ));

        ArgumentCaptor<Expense> captor = ArgumentCaptor.forClass(Expense.class);
        verify(expenseRepository).save(captor.capture());
        assertThat(captor.getValue().getCategory()).isEqualTo("other");
    }

    @Test
    void createFromOcr_nullResult_skipsWithoutSaving() {
        expenseService.createFromOcr(tenantId, Map.of());

        verify(expenseRepository, never()).save(any());
    }

    @Test
    void createFromOcr_invalidAmountFormat_usesOne() {
        when(expenseRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        expenseService.createFromOcr(tenantId, Map.of(
                "result", Map.of("total_amount", "N/A")
        ));

        ArgumentCaptor<Expense> captor = ArgumentCaptor.forClass(Expense.class);
        verify(expenseRepository).save(captor.capture());
        // Falls back to 1 (BigDecimal.ONE) so amount > 0 constraint is satisfied
        assertThat(captor.getValue().getAmount()).isEqualByComparingTo(BigDecimal.ONE);
    }

    @Test
    void createFromOcr_publishesExpenseCreatedEvent() {
        when(expenseRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        expenseService.createFromOcr(tenantId, Map.of(
                "result", Map.of("total_amount", "200")
        ));

        verify(eventPublisher).publishExpenseCreated(eq(tenantId), any(Expense.class));
    }
}
