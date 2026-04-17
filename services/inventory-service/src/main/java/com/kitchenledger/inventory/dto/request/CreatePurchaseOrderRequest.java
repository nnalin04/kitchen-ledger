package com.kitchenledger.inventory.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Data
public class CreatePurchaseOrderRequest {

    @NotNull
    private UUID supplierId;

    private LocalDate expectedDeliveryDate;

    @NotEmpty
    @Valid
    private List<LineItemRequest> items;

    @PositiveOrZero
    private BigDecimal taxAmount = BigDecimal.ZERO;

    private String notes;

    @Data
    public static class LineItemRequest {
        @NotNull
        private UUID inventoryItemId;

        @Positive
        private BigDecimal orderedQuantity;

        @NotBlank
        private String orderedUnit;

        @Positive
        private BigDecimal unitPrice;
    }
}
