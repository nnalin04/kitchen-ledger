package com.kitchenledger.inventory.event;

import com.kitchenledger.inventory.service.StockReceiptService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class InventoryEventListener {

    private final StockReceiptService stockReceiptService;

    @RabbitListener(queues = "${rabbitmq.queues.inventory-service:inventory-service}")
    public void onEvent(EventEnvelope envelope) {
        if (!"ai.ocr.completed".equals(envelope.getEventType())) {
            log.debug("InventoryEventListener: ignoring event type '{}'", envelope.getEventType());
            return;
        }

        Map<String, Object> payload = envelope.getPayload();
        String docType = (String) payload.get("document_type");

        // Only delivery notes and receipts are relevant for stock receipt prefill
        if (!"delivery_note".equals(docType) && !"receipt".equals(docType)) {
            log.debug("InventoryEventListener: OCR doc type '{}' not handled, skipping", docType);
            return;
        }

        String referenceIdStr = (String) payload.get("reference_id");
        if (referenceIdStr == null) {
            log.warn("InventoryEventListener: ai.ocr.completed has no reference_id, cannot prefill receipt");
            return;
        }

        UUID tenantId  = UUID.fromString(envelope.getTenantId());
        UUID receiptId = UUID.fromString(referenceIdStr);

        // Prefer top-level line_items (v2 flat format); fall back to result.line_items (v1 legacy)
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> topLevel = (List<Map<String, Object>>) payload.get("line_items");

        final List<Map<String, Object>> lineItems;
        if (topLevel != null) {
            lineItems = topLevel;
        } else {
            @SuppressWarnings("unchecked")
            Map<String, Object> resultMap = (Map<String, Object>) payload.get("result");
            if (resultMap != null) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> nested = (List<Map<String, Object>>) resultMap.get("line_items");
                lineItems = nested != null ? nested : List.of();
            } else {
                lineItems = List.of();
            }
        }

        log.info("InventoryEventListener: prefilling receipt {} from OCR (doc_type={}, {} line items)",
                receiptId, docType, lineItems.size());
        stockReceiptService.prefillFromOcr(tenantId, receiptId, lineItems);
    }
}
