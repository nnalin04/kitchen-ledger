package com.kitchenledger.inventory.dto.response;

import com.kitchenledger.inventory.model.StockReceipt;
import com.kitchenledger.inventory.model.enums.StockItemCondition;
import com.kitchenledger.inventory.model.enums.ThreeWayMatchStatus;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class StockReceiptResponse {

    private UUID id;
    private UUID tenantId;
    private UUID purchaseOrderId;
    private UUID supplierId;
    private LocalDate receiptDate;
    private String invoiceNumber;
    private LocalDate invoiceDate;
    private BigDecimal invoiceAmount;
    private String invoiceImageUrl;
    private ThreeWayMatchStatus threeWayMatchStatus;
    private String matchNotes;
    private UUID receivedBy;
    private boolean confirmed;
    private Instant confirmedAt;
    private List<LineItemResponse> items;
    private Instant createdAt;

    @Data
    @Builder
    public static class LineItemResponse {
        private UUID id;
        private UUID inventoryItemId;
        private BigDecimal expectedQuantity;
        private BigDecimal receivedQuantity;
        private String unit;
        private BigDecimal unitCost;
        private LocalDate expiryDate;
        private String batchNumber;
        private String storageLocation;
        private StockItemCondition condition;
    }

    public static StockReceiptResponse from(StockReceipt receipt) {
        List<LineItemResponse> lineItems = receipt.getItems().stream()
                .map(item -> LineItemResponse.builder()
                        .id(item.getId())
                        .inventoryItemId(item.getInventoryItemId())
                        .expectedQuantity(item.getExpectedQuantity())
                        .receivedQuantity(item.getReceivedQuantity())
                        .unit(item.getUnit())
                        .unitCost(item.getUnitCost())
                        .expiryDate(item.getExpiryDate())
                        .batchNumber(item.getBatchNumber())
                        .storageLocation(item.getStorageLocation())
                        .condition(item.getCondition())
                        .build())
                .toList();

        return StockReceiptResponse.builder()
                .id(receipt.getId())
                .tenantId(receipt.getTenantId())
                .purchaseOrderId(receipt.getPurchaseOrderId())
                .supplierId(receipt.getSupplierId())
                .receiptDate(receipt.getReceiptDate())
                .invoiceNumber(receipt.getInvoiceNumber())
                .invoiceDate(receipt.getInvoiceDate())
                .invoiceAmount(receipt.getInvoiceAmount())
                .invoiceImageUrl(receipt.getInvoiceImageUrl())
                .threeWayMatchStatus(receipt.getThreeWayMatchStatus())
                .matchNotes(receipt.getMatchNotes())
                .receivedBy(receipt.getReceivedBy())
                .confirmed(receipt.isConfirmed())
                .confirmedAt(receipt.getConfirmedAt())
                .items(lineItems)
                .createdAt(receipt.getCreatedAt())
                .build();
    }
}
