package com.kitchenledger.inventory.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ReceiveLineItemRequest {

    @NotNull
    private UUID lineItemId;

    @NotNull
    @DecimalMin(value = "0.001", message = "Received quantity must be greater than 0")
    private BigDecimal receivedQuantity;
}
