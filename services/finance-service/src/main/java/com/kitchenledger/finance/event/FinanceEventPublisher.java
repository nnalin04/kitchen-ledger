package com.kitchenledger.finance.event;

import com.kitchenledger.finance.model.DailySalesReport;
import com.kitchenledger.finance.model.Expense;
import com.kitchenledger.finance.model.VendorPayment;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class FinanceEventPublisher {

    private final RabbitTemplate rabbitTemplate;

    @Value("${rabbitmq.exchange:kitchenledger.events}")
    private String exchange;

    public void publishExpenseCreated(UUID tenantId, Expense expense) {
        publish(tenantId, "finance.expense.created", Map.of(
                "expense_id",    expense.getId().toString(),
                "category",      expense.getCategory(),
                "amount",        expense.getAmount().toPlainString(),
                "expense_date",  expense.getExpenseDate().toString()
        ));
    }

    public void publishDsrReconciled(UUID tenantId, DailySalesReport dsr) {
        publish(tenantId, "finance.dsr.reconciled", Map.of(
                "dsr_id",        dsr.getId().toString(),
                "report_date",   dsr.getReportDate().toString(),
                "gross_sales",   dsr.getGrossSales().toPlainString(),
                "net_sales",     dsr.getNetSales() != null ? dsr.getNetSales().toPlainString() : "0",
                "covers_count",  String.valueOf(dsr.getCoversCount()),
                "currency",      "INR"
        ));
    }

    public void publishPaymentOverdue(VendorPayment vp) {
        publish(vp.getTenantId(), "finance.payment.overdue", Map.of(
                "payment_id", vp.getId().toString(),
                "vendor_id",  vp.getVendorId().toString(),
                "amount",     vp.getAmount().toPlainString(),
                "due_date",   vp.getDueDate().toString(),
                "currency",   "INR"
        ));
    }

    private void publish(UUID tenantId, String eventType, Map<String, Object> payload) {
        try {
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
        } catch (Exception e) {
            log.error("Failed to publish event {} for tenant {}: {}", eventType, tenantId, e.getMessage());
        }
    }
}
