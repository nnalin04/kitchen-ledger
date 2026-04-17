package com.kitchenledger.inventory.dto.response;

import com.kitchenledger.inventory.model.PurchaseOrder;
import com.kitchenledger.inventory.model.PurchaseOrderItem;
import com.kitchenledger.inventory.model.enums.PurchaseOrderStatus;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class PurchaseOrderResponse {

    private UUID id;
    private UUID tenantId;
    private String poNumber;
    private UUID supplierId;
    private PurchaseOrderStatus status;
    private LocalDate orderDate;
    private LocalDate expectedDeliveryDate;
    private LocalDate actualDeliveryDate;
    private BigDecimal subtotal;
    private BigDecimal taxAmount;
    private BigDecimal totalAmount;
    private String notes;
    private String sentVia;
    private Instant sentAt;
    private UUID createdBy;
    private UUID receivedBy;
    private List<LineItemResponse> items;
    private Instant createdAt;
    private Instant updatedAt;

    @Data
    @Builder
    public static class LineItemResponse {
        private UUID id;
        private UUID inventoryItemId;
        private BigDecimal orderedQuantity;
        private String orderedUnit;
        private BigDecimal unitPrice;
        private BigDecimal lineTotal;
        private BigDecimal receivedQuantity;
        private BigDecimal invoiceUnitPrice;
        private String discrepancyNotes;
    }

    public static PurchaseOrderResponse from(PurchaseOrder po) {
        List<LineItemResponse> lineItems = po.getItems().stream()
                .map(item -> LineItemResponse.builder()
                        .id(item.getId())
                        .inventoryItemId(item.getInventoryItemId())
                        .orderedQuantity(item.getOrderedQuantity())
                        .orderedUnit(item.getOrderedUnit())
                        .unitPrice(item.getUnitPrice())
                        .lineTotal(item.getLineTotal())
                        .receivedQuantity(item.getReceivedQuantity())
                        .invoiceUnitPrice(item.getInvoiceUnitPrice())
                        .discrepancyNotes(item.getDiscrepancyNotes())
                        .build())
                .toList();

        return PurchaseOrderResponse.builder()
                .id(po.getId())
                .tenantId(po.getTenantId())
                .poNumber(po.getPoNumber())
                .supplierId(po.getSupplierId())
                .status(po.getStatus())
                .orderDate(po.getOrderDate())
                .expectedDeliveryDate(po.getExpectedDeliveryDate())
                .actualDeliveryDate(po.getActualDeliveryDate())
                .subtotal(po.getSubtotal())
                .taxAmount(po.getTaxAmount())
                .totalAmount(po.getTotalAmount())
                .notes(po.getNotes())
                .sentVia(po.getSentVia())
                .sentAt(po.getSentAt())
                .createdBy(po.getCreatedBy())
                .receivedBy(po.getReceivedBy())
                .items(lineItems)
                .createdAt(po.getCreatedAt())
                .updatedAt(po.getUpdatedAt())
                .build();
    }
}
