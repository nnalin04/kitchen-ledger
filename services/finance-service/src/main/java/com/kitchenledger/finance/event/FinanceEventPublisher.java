package com.kitchenledger.finance.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kitchenledger.finance.model.DailySalesReport;
import com.kitchenledger.finance.model.Expense;
import com.kitchenledger.finance.model.VendorPayment;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Recover;
import org.springframework.retry.annotation.Retryable;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class FinanceEventPublisher {

    private final RabbitTemplate rabbitTemplate;
    private final OutboxEventRepository outboxEventRepository;
    private final ObjectMapper objectMapper;

    @Value("${rabbitmq.exchange:kitchenledger.events}")
    private String exchange;

    @Retryable(
        retryFor = AmqpException.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void publishExpenseCreated(UUID tenantId, Expense expense) {
        Map<String, Object> payload = Map.of(
                "expense_id",    expense.getId().toString(),
                "category",      expense.getCategory(),
                "amount",        expense.getAmount().toPlainString(),
                "expense_date",  expense.getExpenseDate().toString()
        );
        publishEnvelope(tenantId, "finance.expense.created", payload);
    }

    @Recover
    public void recoverPublishExpenseCreated(AmqpException ex, UUID tenantId, Expense expense) {
        log.error("CRITICAL: Event publish failed after 3 retries for key finance.expense.created. Saving to outbox.", ex);
        saveToOutbox(tenantId, "finance.expense.created", Map.of(
                "expense_id",    expense.getId().toString(),
                "category",      expense.getCategory(),
                "amount",        expense.getAmount().toPlainString(),
                "expense_date",  expense.getExpenseDate().toString()
        ));
    }

    @Retryable(
        retryFor = AmqpException.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void publishDsrReconciled(UUID tenantId, DailySalesReport dsr) {
        Map<String, Object> payload = Map.of(
                "dsr_id",        dsr.getId().toString(),
                "report_date",   dsr.getReportDate().toString(),
                "gross_sales",   dsr.getGrossSales().toPlainString(),
                "net_sales",     dsr.getNetSales() != null ? dsr.getNetSales().toPlainString() : "0",
                "covers_count",  String.valueOf(dsr.getCoversCount()),
                "currency",      "INR"
        );
        publishEnvelope(tenantId, "finance.dsr.reconciled", payload);
    }

    @Recover
    public void recoverPublishDsrReconciled(AmqpException ex, UUID tenantId, DailySalesReport dsr) {
        log.error("CRITICAL: Event publish failed after 3 retries for key finance.dsr.reconciled. Saving to outbox.", ex);
        saveToOutbox(tenantId, "finance.dsr.reconciled", Map.of(
                "dsr_id",        dsr.getId().toString(),
                "report_date",   dsr.getReportDate().toString(),
                "gross_sales",   dsr.getGrossSales().toPlainString(),
                "net_sales",     dsr.getNetSales() != null ? dsr.getNetSales().toPlainString() : "0",
                "covers_count",  String.valueOf(dsr.getCoversCount()),
                "currency",      "INR"
        ));
    }

    @Retryable(
        retryFor = AmqpException.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void publishCashDiscrepancy(DailySalesReport dsr, BigDecimal expectedCash,
                                       BigDecimal actualCash, BigDecimal variance) {
        String direction = variance.compareTo(BigDecimal.ZERO) > 0 ? "OVER" : "SHORT";
        Map<String, Object> payload = Map.of(
                "dsr_id",             dsr.getId().toString(),
                "report_date",        dsr.getReportDate().toString(),
                "expected_cash",      expectedCash.toPlainString(),
                "actual_cash",        actualCash.toPlainString(),
                "variance",           variance.toPlainString(),
                "variance_direction", direction,
                "currency",           "INR"
        );
        publishEnvelope(dsr.getTenantId(), "finance.cash.discrepancy", payload);
    }

    @Recover
    public void recoverPublishCashDiscrepancy(AmqpException ex, DailySalesReport dsr,
                                              BigDecimal expectedCash, BigDecimal actualCash,
                                              BigDecimal variance) {
        log.error("CRITICAL: Event publish failed after 3 retries for key finance.cash.discrepancy. Saving to outbox.", ex);
        String direction = variance.compareTo(BigDecimal.ZERO) > 0 ? "OVER" : "SHORT";
        saveToOutbox(dsr.getTenantId(), "finance.cash.discrepancy", Map.of(
                "dsr_id",             dsr.getId().toString(),
                "report_date",        dsr.getReportDate().toString(),
                "expected_cash",      expectedCash.toPlainString(),
                "actual_cash",        actualCash.toPlainString(),
                "variance",           variance.toPlainString(),
                "variance_direction", direction,
                "currency",           "INR"
        ));
    }

    @Retryable(
        retryFor = AmqpException.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void publishPaymentOverdue(VendorPayment vp) {
        Map<String, Object> payload = Map.of(
                "payment_id", vp.getId().toString(),
                "vendor_id",  vp.getVendorId().toString(),
                "amount",     vp.getAmount().toPlainString(),
                "due_date",   vp.getDueDate().toString(),
                "currency",   "INR"
        );
        publishEnvelope(vp.getTenantId(), "finance.payment.overdue", payload);
    }

    @Recover
    public void recoverPublishPaymentOverdue(AmqpException ex, VendorPayment vp) {
        log.error("CRITICAL: Event publish failed after 3 retries for key finance.payment.overdue. Saving to outbox.", ex);
        saveToOutbox(vp.getTenantId(), "finance.payment.overdue", Map.of(
                "payment_id", vp.getId().toString(),
                "vendor_id",  vp.getVendorId().toString(),
                "amount",     vp.getAmount().toPlainString(),
                "due_date",   vp.getDueDate().toString(),
                "currency",   "INR"
        ));
    }

    private void publishEnvelope(UUID tenantId, String eventType, Map<String, Object> payload) {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventId(UUID.randomUUID().toString())
                .eventType(eventType)
                .tenantId(tenantId.toString())
                .producedBy("finance-service")
                .producedAt(Instant.now().toString())
                .version("1.0")
                .payload(payload)
                .build();

        rabbitTemplate.convertAndSend(exchange, eventType, envelope);
        log.debug("Published event: {} for tenant {}", eventType, tenantId);
    }

    private void saveToOutbox(UUID tenantId, String routingKey, Map<String, Object> payload) {
        try {
            String json = objectMapper.writeValueAsString(payload);
            outboxEventRepository.save(OutboxEvent.builder()
                    .tenantId(tenantId)
                    .routingKey(routingKey)
                    .payload(json)
                    .failedAt(Instant.now())
                    .build());
        } catch (Exception saveEx) {
            log.error("FATAL: Could not save event to outbox either. Event LOST. Key={}", routingKey, saveEx);
        }
    }
}
