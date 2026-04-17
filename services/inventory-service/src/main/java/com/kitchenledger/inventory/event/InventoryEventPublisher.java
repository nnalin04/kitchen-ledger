package com.kitchenledger.inventory.event;

import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.PurchaseOrder;
import com.kitchenledger.inventory.model.StockReceiptItem;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
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

    @Value("${rabbitmq.exchange:kitchenledger.events}")
    private String exchange;

    public void publishStockLow(UUID tenantId, InventoryItem item) {
        publish(tenantId, "inventory.stock.low", Map.of(
                "item_id",       item.getId().toString(),
                "item_name",     item.getName(),
                "current_stock", item.getCurrentStock().toPlainString(),
                "par_level",     item.getParLevel() != null ? item.getParLevel().toPlainString() : "0",
                "unit",          item.getCountUnit()
        ));
    }

    public void publishReceiptConfirmed(UUID tenantId, UUID receiptId, UUID supplierId) {
        publish(tenantId, "inventory.receipt.confirmed", Map.of(
                "receipt_id",  receiptId.toString(),
                "supplier_id", supplierId != null ? supplierId.toString() : ""
        ));
    }

    public void publishPoSent(UUID tenantId, PurchaseOrder po) {
        publish(tenantId, "inventory.po.sent", Map.of(
                "po_id",        po.getId().toString(),
                "po_number",    po.getPoNumber(),
                "supplier_id",  po.getSupplierId().toString(),
                "total_amount", po.getTotalAmount().toPlainString(),
                "sent_via",     po.getSentVia() != null ? po.getSentVia() : "manual"
        ));
    }

    public void publishStockExpiring(UUID tenantId, InventoryItem item,
                                      StockReceiptItem batch, int daysRemaining) {
        publish(tenantId, "inventory.stock.expiring", Map.of(
                "item_id",        item.getId().toString(),
                "item_name",      item.getName(),
                "expiry_date",    batch.getExpiryDate().toString(),
                "days_remaining", String.valueOf(daysRemaining),
                "quantity",       batch.getReceivedQuantity().toPlainString(),
                "unit",           batch.getUnit()
        ));
    }

    public void publishPriceAlert(UUID tenantId, InventoryItem item, BigDecimal deltaPercent) {
        publish(tenantId, "inventory.price.alert", Map.of(
                "item_id",         item.getId().toString(),
                "item_name",       item.getName(),
                "delta_percent",   deltaPercent.toPlainString(),
                "new_price",       item.getLastPurchasePrice() != null
                                        ? item.getLastPurchasePrice().toPlainString() : "0",
                "avg_cost",        item.getAvgCost().toPlainString()
        ));
    }

    private void publish(UUID tenantId, String eventType, Map<String, Object> payload) {
        try {
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
        } catch (Exception e) {
            log.error("Failed to publish event {} for tenant {}: {}", eventType, tenantId, e.getMessage());
        }
    }
}
