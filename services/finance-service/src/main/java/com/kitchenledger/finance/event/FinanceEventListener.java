package com.kitchenledger.finance.event;

import com.kitchenledger.finance.service.AccountService;
import com.kitchenledger.finance.service.ExpenseService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class FinanceEventListener {

    private final AccountService accountService;
    private final ExpenseService expenseService;

    @RabbitListener(queues = "${rabbitmq.queues.finance-service:finance-service}")
    public void onEvent(EventEnvelope envelope) {
        String eventType = envelope.getEventType();
        UUID tenantId = UUID.fromString(envelope.getTenantId());

        switch (eventType) {
            case "auth.tenant.created" -> handleTenantCreated(tenantId);
            case "ai.ocr.completed"    -> handleOcrCompleted(tenantId, envelope.getPayload());
            default -> log.debug("FinanceEventListener: ignoring event type '{}'", eventType);
        }
    }

    private void handleTenantCreated(UUID tenantId) {
        log.info("FinanceEventListener: seeding default accounts for new tenant {}", tenantId);
        accountService.seedDefaultAccounts(tenantId);
    }

    private void handleOcrCompleted(UUID tenantId, Map<String, Object> payload) {
        String docType = (String) payload.get("document_type");
        if (!"receipt".equals(docType) && !"invoice".equals(docType)) {
            log.debug("FinanceEventListener: OCR doc type '{}' not handled by finance, skipping", docType);
            return;
        }
        log.info("FinanceEventListener: creating expense from OCR result for tenant {} (doc_type={})",
                tenantId, docType);
        expenseService.createFromOcr(tenantId, payload);
    }
}
