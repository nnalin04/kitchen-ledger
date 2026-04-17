package com.kitchenledger.finance.event;

import com.kitchenledger.finance.service.AccountService;
import com.kitchenledger.finance.service.ExpenseService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FinanceEventListenerTest {

    @Mock
    private AccountService accountService;

    @Mock
    private ExpenseService expenseService;

    @InjectMocks
    private FinanceEventListener financeEventListener;

    private final UUID tenantId = UUID.randomUUID();

    // ── auth.tenant.created ───────────────────────────────────────────────────

    @Test
    void onTenantCreated_seedsDefaultAccounts() {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventType("auth.tenant.created")
                .tenantId(tenantId.toString())
                .payload(Map.of("tenant_id", tenantId.toString()))
                .build();

        financeEventListener.onEvent(envelope);

        verify(accountService).seedDefaultAccounts(tenantId);
    }

    @Test
    void onTenantCreated_idempotent_calledTwice_seedsEachTime() {
        // Idempotency is enforced inside AccountService.seedDefaultAccounts() itself;
        // the listener just delegates — verify it calls through both times.
        EventEnvelope envelope = EventEnvelope.builder()
                .eventType("auth.tenant.created")
                .tenantId(tenantId.toString())
                .payload(Map.of("tenant_id", tenantId.toString()))
                .build();

        financeEventListener.onEvent(envelope);
        financeEventListener.onEvent(envelope);

        verify(accountService, times(2)).seedDefaultAccounts(tenantId);
    }

    // ── ai.ocr.completed ──────────────────────────────────────────────────────

    @Test
    void onOcrCompleted_receipt_createsExpense() {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventType("ai.ocr.completed")
                .tenantId(tenantId.toString())
                .payload(Map.of(
                        "document_type", "receipt",
                        "result", Map.of("total_amount", "500")
                ))
                .build();

        financeEventListener.onEvent(envelope);

        verify(expenseService).createFromOcr(eq(tenantId), any());
    }

    @Test
    void onOcrCompleted_invoice_createsExpense() {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventType("ai.ocr.completed")
                .tenantId(tenantId.toString())
                .payload(Map.of(
                        "document_type", "invoice",
                        "result", Map.of("total_amount", "800")
                ))
                .build();

        financeEventListener.onEvent(envelope);

        verify(expenseService).createFromOcr(eq(tenantId), any());
    }

    @Test
    void onOcrCompleted_deliveryNote_skipsExpenseCreation() {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventType("ai.ocr.completed")
                .tenantId(tenantId.toString())
                .payload(Map.of("document_type", "delivery_note"))
                .build();

        financeEventListener.onEvent(envelope);

        verify(expenseService, never()).createFromOcr(any(), any());
    }

    @Test
    void onOcrCompleted_unknownDocType_skipsExpenseCreation() {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventType("ai.ocr.completed")
                .tenantId(tenantId.toString())
                .payload(Map.of("document_type", "menu_photo"))
                .build();

        financeEventListener.onEvent(envelope);

        verify(expenseService, never()).createFromOcr(any(), any());
    }

    // ── unknown event ─────────────────────────────────────────────────────────

    @Test
    void onUnknownEvent_noOp() {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventType("something.else.happened")
                .tenantId(tenantId.toString())
                .payload(Map.of())
                .build();

        financeEventListener.onEvent(envelope);

        verify(accountService, never()).seedDefaultAccounts(any());
        verify(expenseService, never()).createFromOcr(any(), any());
    }
}
