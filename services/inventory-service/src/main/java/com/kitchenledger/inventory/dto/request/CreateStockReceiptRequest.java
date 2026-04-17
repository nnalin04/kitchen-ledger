package com.kitchenledger.inventory.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Data
public class CreateStockReceiptRequest {

    private UUID purchaseOrderId;
    private UUID supplierId;
    private LocalDate receiptDate;
    private String invoiceNumber;
    private LocalDate invoiceDate;
    private BigDecimal invoiceAmount;
    private String invoiceImageUrl;

    @NotEmpty
    @Valid
    private List<LineItemRequest> items;

    @Data
    public static class LineItemRequest {
        @NotNull
        private UUID inventoryItemId;

        private BigDecimal expectedQuantity;

        @Positive
        private BigDecimal receivedQuantity;

        @NotBlank
        private String unit;

        @Positive
        private BigDecimal unitCost;

        private LocalDate expiryDate;
        private String batchNumber;
        private String storageLocation;
        private String condition = "good";
    }
}
