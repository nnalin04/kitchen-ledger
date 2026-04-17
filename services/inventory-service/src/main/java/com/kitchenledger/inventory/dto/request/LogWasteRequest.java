package com.kitchenledger.inventory.dto.request;

import com.kitchenledger.inventory.model.enums.WasteReason;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class LogWasteRequest {

    @NotNull
    private UUID inventoryItemId;

    @Positive
    private BigDecimal quantity;

    @NotBlank
    private String unit;

    @NotNull
    private WasteReason reason;

    private String station;
    private BigDecimal estimatedCost;
    private String photoUrl;
    private String notes;
}
