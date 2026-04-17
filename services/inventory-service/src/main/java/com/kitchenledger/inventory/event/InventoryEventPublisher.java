package com.kitchenledger.inventory.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.PurchaseOrder;
import com.kitchenledger.inventory.model.StockReceiptItem;
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
public class InventoryEventPublisher {

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
    public void publishStockLow(UUID tenantId, InventoryItem item) {
        Map<String, Object> payload = Map.of(
                "item_id",       item.getId().toString(),
                "item_name",     item.getName(),
                "current_stock", item.getCurrentStock().toPlainString(),
                "par_level",     item.getParLevel() != null ? item.getParLevel().toPlainString() : "0",
                "unit",          item.getCountUnit()
        );
        publishEnvelope(tenantId, "inventory.stock.low", payload);
    }

    @Recover
    public void recoverPublishStockLow(AmqpException ex, UUID tenantId, InventoryItem item) {
        log.error("CRITICAL: Event publish failed after 3 retries for key inventory.stock.low. Saving to outbox.", ex);
        saveToOutbox(tenantId, "inventory.stock.low", Map.of(
                "item_id",       item.getId().toString(),
                "item_name",     item.getName(),
                "current_stock", item.getCurrentStock().toPlainString(),
                "par_level",     item.getParLevel() != null ? item.getParLevel().toPlainString() : "0",
                "unit",          item.getCountUnit()
        ));
    }

    @Retryable(
        retryFor = AmqpException.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void publishReceiptConfirmed(UUID tenantId, UUID receiptId, UUID supplierId) {
        Map<String, Object> payload = Map.of(
                "receipt_id",  receiptId.toString(),
                "supplier_id", supplierId != null ? supplierId.toString() : ""
        );
        publishEnvelope(tenantId, "inventory.receipt.confirmed", payload);
    }

    @Recover
    public void recoverPublishReceiptConfirmed(AmqpException ex, UUID tenantId, UUID receiptId, UUID supplierId) {
        log.error("CRITICAL: Event publish failed after 3 retries for key inventory.receipt.confirmed. Saving to outbox.", ex);
        saveToOutbox(tenantId, "inventory.receipt.confirmed", Map.of(
                "receipt_id",  receiptId.toString(),
                "supplier_id", supplierId != null ? supplierId.toString() : ""
        ));
    }

    @Retryable(
        retryFor = AmqpException.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void publishPoSent(UUID tenantId, PurchaseOrder po) {
        Map<String, Object> payload = Map.of(
                "po_id",        po.getId().toString(),
                "po_number",    po.getPoNumber(),
                "supplier_id",  po.getSupplierId().toString(),
                "total_amount", po.getTotalAmount().toPlainString(),
                "sent_via",     po.getSentVia() != null ? po.getSentVia() : "manual"
        );
        publishEnvelope(tenantId, "inventory.po.sent", payload);
    }

    @Recover
    public void recoverPublishPoSent(AmqpException ex, UUID tenantId, PurchaseOrder po) {
        log.error("CRITICAL: Event publish failed after 3 retries for key inventory.po.sent. Saving to outbox.", ex);
        saveToOutbox(tenantId, "inventory.po.sent", Map.of(
                "po_id",        po.getId().toString(),
                "po_number",    po.getPoNumber(),
                "supplier_id",  po.getSupplierId().toString(),
                "total_amount", po.getTotalAmount().toPlainString(),
                "sent_via",     po.getSentVia() != null ? po.getSentVia() : "manual"
        ));
    }

    @Retryable(
        retryFor = AmqpException.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void publishStockExpiring(UUID tenantId, InventoryItem item,
                                      StockReceiptItem batch, int daysRemaining) {
        Map<String, Object> payload = Map.of(
                "item_id",        item.getId().toString(),
                "item_name",      item.getName(),
                "expiry_date",    batch.getExpiryDate().toString(),
                "days_remaining", String.valueOf(daysRemaining),
                "quantity",       batch.getReceivedQuantity().toPlainString(),
                "unit",           batch.getUnit()
        );
        publishEnvelope(tenantId, "inventory.stock.expiring", payload);
    }

    @Recover
    public void recoverPublishStockExpiring(AmqpException ex, UUID tenantId, InventoryItem item,
                                             StockReceiptItem batch, int daysRemaining) {
        log.error("CRITICAL: Event publish failed after 3 retries for key inventory.stock.expiring. Saving to outbox.", ex);
        saveToOutbox(tenantId, "inventory.stock.expiring", Map.of(
                "item_id",        item.getId().toString(),
                "item_name",      item.getName(),
                "expiry_date",    batch.getExpiryDate().toString(),
                "days_remaining", String.valueOf(daysRemaining),
                "quantity",       batch.getReceivedQuantity().toPlainString(),
                "unit",           batch.getUnit()
        ));
    }

    @Retryable(
        retryFor = AmqpException.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void publishPriceAlert(UUID tenantId, InventoryItem item, BigDecimal deltaPercent) {
        Map<String, Object> payload = Map.of(
                "item_id",         item.getId().toString(),
                "item_name",       item.getName(),
                "delta_percent",   deltaPercent.toPlainString(),
                "new_price",       item.getLastPurchasePrice() != null
                                        ? item.getLastPurchasePrice().toPlainString() : "0",
                "avg_cost",        item.getAvgCost().toPlainString()
        );
        publishEnvelope(tenantId, "inventory.price.alert", payload);
    }

    @Recover
    public void recoverPublishPriceAlert(AmqpException ex, UUID tenantId, InventoryItem item, BigDecimal deltaPercent) {
        log.error("CRITICAL: Event publish failed after 3 retries for key inventory.price.alert. Saving to outbox.", ex);
        saveToOutbox(tenantId, "inventory.price.alert", Map.of(
                "item_id",         item.getId().toString(),
                "item_name",       item.getName(),
                "delta_percent",   deltaPercent.toPlainString(),
                "new_price",       item.getLastPurchasePrice() != null
                                        ? item.getLastPurchasePrice().toPlainString() : "0",
                "avg_cost",        item.getAvgCost().toPlainString()
        ));
    }

    private void publishEnvelope(UUID tenantId, String eventType, Map<String, Object> payload) {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventId(UUID.randomUUID().toString())
                .eventType(eventType)
                .tenantId(tenantId.toString())
                .producedBy("inventory-service")
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
