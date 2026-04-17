package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.dto.request.CreateStockReceiptRequest;
import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.exception.ConflictException;
import com.kitchenledger.inventory.exception.ResourceNotFoundException;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.InventoryMovement;
import com.kitchenledger.inventory.model.StockReceipt;
import com.kitchenledger.inventory.model.StockReceiptItem;
import com.kitchenledger.inventory.model.enums.MovementType;
import com.kitchenledger.inventory.model.enums.StockItemCondition;
import com.kitchenledger.inventory.model.enums.ThreeWayMatchStatus;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.InventoryMovementRepository;
import com.kitchenledger.inventory.repository.StockReceiptItemRepository;
import com.kitchenledger.inventory.repository.StockReceiptRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class StockReceiptService {

    private final StockReceiptRepository receiptRepository;
    private final InventoryItemRepository itemRepository;
    private final InventoryMovementRepository movementRepository;
    private final InventoryEventPublisher eventPublisher;
    private final StockReceiptItemRepository receiptItemRepository;

    @Transactional(readOnly = true)
    public Page<StockReceipt> list(UUID tenantId, Pageable pageable) {
        return receiptRepository.findByTenantId(tenantId, pageable);
    }

    @Transactional(readOnly = true)
    public StockReceipt getById(UUID tenantId, UUID id) {
        return receiptRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Stock receipt not found: " + id));
    }

    @Transactional
    public StockReceipt create(UUID tenantId, UUID receivedBy, CreateStockReceiptRequest req) {
        List<StockReceiptItem> lineItems = req.getItems().stream()
                .map(li -> StockReceiptItem.builder()
                        .inventoryItemId(li.getInventoryItemId())
                        .expectedQuantity(li.getExpectedQuantity())
                        .receivedQuantity(li.getReceivedQuantity())
                        .unit(li.getUnit())
                        .unitCost(li.getUnitCost())
                        .expiryDate(li.getExpiryDate())
                        .batchNumber(li.getBatchNumber())
                        .storageLocation(li.getStorageLocation())
                        .condition(StockItemCondition.valueOf(
                                li.getCondition() != null ? li.getCondition() : "good"))
                        .build())
                .toList();

        StockReceipt receipt = StockReceipt.builder()
                .tenantId(tenantId)
                .purchaseOrderId(req.getPurchaseOrderId())
                .supplierId(req.getSupplierId())
                .receiptDate(req.getReceiptDate() != null ? req.getReceiptDate() : java.time.LocalDate.now())
                .invoiceNumber(req.getInvoiceNumber())
                .invoiceDate(req.getInvoiceDate())
                .invoiceAmount(req.getInvoiceAmount())
                .invoiceImageUrl(req.getInvoiceImageUrl())
                .receivedBy(receivedBy)
                .items(new ArrayList<>(lineItems))
                .build();

        return receiptRepository.save(receipt);
    }

    /**
     * Confirms the receipt: updates stock levels (weighted avg cost), writes movement ledger,
     * performs three-way match, and fires inventory.receipt.confirmed event.
     */
    @Transactional
    public StockReceipt confirm(UUID tenantId, UUID id) {
        StockReceipt receipt = getById(tenantId, id);
        if (receipt.isConfirmed()) {
            throw new ConflictException("Stock receipt already confirmed: " + id);
        }

        boolean anyDiscrepancy = false;

        for (StockReceiptItem lineItem : receipt.getItems()) {
            InventoryItem item = itemRepository
                    .findByIdAndTenantIdAndDeletedAtIsNull(lineItem.getInventoryItemId(), tenantId)
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Inventory item not found: " + lineItem.getInventoryItemId()));

            // Three-way match check: expected vs received
            if (lineItem.getExpectedQuantity() != null
                    && lineItem.getReceivedQuantity().compareTo(lineItem.getExpectedQuantity()) != 0) {
                anyDiscrepancy = true;
            }

            // Weighted average cost: (currentStock * avgCost + received * unitCost) / newStock
            BigDecimal newStock = item.getCurrentStock().add(lineItem.getReceivedQuantity());
            if (newStock.compareTo(BigDecimal.ZERO) > 0) {
                BigDecimal newAvgCost = item.getCurrentStock()
                        .multiply(item.getAvgCost())
                        .add(lineItem.getReceivedQuantity().multiply(lineItem.getUnitCost()))
                        .divide(newStock, 4, RoundingMode.HALF_UP);
                item.setAvgCost(newAvgCost);
            }

            // Price alert: if unit cost is significantly higher than avg cost
            if (item.getLastPurchasePrice() != null
                    && item.getLastPurchasePrice().compareTo(BigDecimal.ZERO) > 0) {
                BigDecimal deltaPercent = lineItem.getUnitCost()
                        .subtract(item.getLastPurchasePrice())
                        .abs()
                        .multiply(new BigDecimal("100"))
                        .divide(item.getLastPurchasePrice(), 2, RoundingMode.HALF_UP);
                if (deltaPercent.compareTo(item.getPriceAlertThreshold()) > 0) {
                    eventPublisher.publishPriceAlert(tenantId, item, deltaPercent);
                }
            }

            item.setCurrentStock(newStock);
            item.setLastPurchasePrice(lineItem.getUnitCost());
            itemRepository.save(item);

            // Append to movement ledger
            movementRepository.save(InventoryMovement.builder()
                    .tenantId(tenantId)
                    .inventoryItemId(item.getId())
                    .movementType(MovementType.receipt)
                    .quantityDelta(lineItem.getReceivedQuantity())
                    .unit(lineItem.getUnit())
                    .unitCost(lineItem.getUnitCost())
                    .referenceId(receipt.getId())
                    .referenceType("stock_receipt")
                    .performedBy(receipt.getReceivedBy())
                    .build());

            // Fire stock-low event after receiving (edge case: very low par with small receipt)
            if (item.isBelowPar()) {
                eventPublisher.publishStockLow(tenantId, item);
            }
        }

        receipt.setConfirmed(true);
        receipt.setConfirmedAt(Instant.now());
        receipt.setThreeWayMatchStatus(
                anyDiscrepancy ? ThreeWayMatchStatus.discrepancy : ThreeWayMatchStatus.matched);

        StockReceipt saved = receiptRepository.save(receipt);
        eventPublisher.publishReceiptConfirmed(tenantId, saved.getId(), saved.getSupplierId());
        return saved;
    }

    /**
     * Pre-fills a pending stock receipt with OCR-extracted line items.
     * Fuzzy-matches each OCR item name against existing inventory items.
     * No-op if the receipt is already confirmed.
     */
    @Transactional
    public void prefillFromOcr(UUID tenantId, UUID receiptId, List<Map<String, Object>> lineItems) {
        StockReceipt receipt = getById(tenantId, receiptId);
        if (receipt.isConfirmed()) {
            log.warn("prefillFromOcr: receipt {} is already confirmed, skipping", receiptId);
            return;
        }

        for (Map<String, Object> item : lineItems) {
            String name = (String) item.get("name");
            if (name == null || name.isBlank()) continue;

            Page<InventoryItem> matches = itemRepository.findWithFilters(
                    tenantId, name, null, false, PageRequest.of(0, 1));
            if (matches.isEmpty()) {
                log.debug("prefillFromOcr: no inventory item matched OCR name '{}'", name);
                continue;
            }

            InventoryItem matched = matches.getContent().get(0);
            BigDecimal quantity;
            try {
                quantity = new BigDecimal(String.valueOf(item.getOrDefault("quantity", "0")));
            } catch (NumberFormatException e) {
                quantity = BigDecimal.ZERO;
            }
            BigDecimal unitCost;
            try {
                unitCost = new BigDecimal(String.valueOf(item.getOrDefault("unit_price", "0")));
            } catch (NumberFormatException e) {
                unitCost = BigDecimal.ZERO;
            }

            receiptItemRepository.save(StockReceiptItem.builder()
                    .stockReceiptId(receiptId)
                    .inventoryItemId(matched.getId())
                    .expectedQuantity(quantity)
                    .receivedQuantity(BigDecimal.ZERO)
                    .unit(matched.getPurchaseUnit())
                    .unitCost(unitCost)
                    .condition(StockItemCondition.good)
                    .build());

            log.info("prefillFromOcr: prefilled item '{}' (id={}) on receipt {}", name, matched.getId(), receiptId);
        }
    }
}
