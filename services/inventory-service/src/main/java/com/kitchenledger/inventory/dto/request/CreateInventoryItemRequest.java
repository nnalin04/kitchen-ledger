package com.kitchenledger.inventory.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.util.UUID;

@Data
public class CreateInventoryItemRequest {

    @NotBlank
    @Size(max = 200)
    private String name;

    private UUID categoryId;
    private String sku;
    private String barcode;
    private String description;

    @NotBlank
    private String purchaseUnit;

    @Positive
    private BigDecimal purchaseUnitQty = BigDecimal.ONE;

    @NotBlank
    private String recipeUnit;

    @NotBlank
    private String countUnit;

    @Positive
    private BigDecimal purchaseToRecipeFactor = BigDecimal.ONE;

    @Positive
    private BigDecimal recipeToCountFactor = BigDecimal.ONE;

    private BigDecimal parLevel;
    private BigDecimal reorderQuantity;

    @PositiveOrZero
    private BigDecimal safetyStock = BigDecimal.ZERO;

    @PositiveOrZero
    private BigDecimal priceAlertThreshold = new BigDecimal("10.00");

    private boolean perishable = false;
    private Integer shelfLifeDays;
    private int expiryAlertDays = 2;
    private String storageLocation;
    private UUID primarySupplierId;
    private String notes;
    private String imageUrl;
}
