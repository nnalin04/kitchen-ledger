package com.kitchenledger.inventory.dto.response;

import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.enums.AbcCategory;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Data
@Builder
public class InventoryItemResponse {

    private UUID id;
    private UUID tenantId;
    private UUID categoryId;
    private String name;
    private String sku;
    private String barcode;
    private String description;
    private AbcCategory abcCategory;
    private boolean abcOverride;
    private String purchaseUnit;
    private BigDecimal purchaseUnitQty;
    private String recipeUnit;
    private String countUnit;
    private BigDecimal purchaseToRecipeFactor;
    private BigDecimal recipeToCountFactor;
    private BigDecimal currentStock;
    private BigDecimal parLevel;
    private BigDecimal reorderQuantity;
    private BigDecimal safetyStock;
    private BigDecimal avgCost;
    private BigDecimal lastPurchasePrice;
    private BigDecimal priceAlertThreshold;
    private boolean perishable;
    private Integer shelfLifeDays;
    private int expiryAlertDays;
    private String storageLocation;
    private UUID primarySupplierId;
    private boolean active;
    private boolean belowPar;
    private String notes;
    private String imageUrl;
    private int version;
    private Instant createdAt;
    private Instant updatedAt;

    public static InventoryItemResponse from(InventoryItem item) {
        return InventoryItemResponse.builder()
                .id(item.getId())
                .tenantId(item.getTenantId())
                .categoryId(item.getCategoryId())
                .name(item.getName())
                .sku(item.getSku())
                .barcode(item.getBarcode())
                .description(item.getDescription())
                .abcCategory(item.getAbcCategory())
                .abcOverride(item.isAbcOverride())
                .purchaseUnit(item.getPurchaseUnit())
                .purchaseUnitQty(item.getPurchaseUnitQty())
                .recipeUnit(item.getRecipeUnit())
                .countUnit(item.getCountUnit())
                .purchaseToRecipeFactor(item.getPurchaseToRecipeFactor())
                .recipeToCountFactor(item.getRecipeToCountFactor())
                .currentStock(item.getCurrentStock())
                .parLevel(item.getParLevel())
                .reorderQuantity(item.getReorderQuantity())
                .safetyStock(item.getSafetyStock())
                .avgCost(item.getAvgCost())
                .lastPurchasePrice(item.getLastPurchasePrice())
                .priceAlertThreshold(item.getPriceAlertThreshold())
                .perishable(item.isPerishable())
                .shelfLifeDays(item.getShelfLifeDays())
                .expiryAlertDays(item.getExpiryAlertDays())
                .storageLocation(item.getStorageLocation())
                .primarySupplierId(item.getPrimarySupplierId())
                .active(item.isActive())
                .belowPar(item.isBelowPar())
                .notes(item.getNotes())
                .imageUrl(item.getImageUrl())
                .version(item.getVersion())
                .createdAt(item.getCreatedAt())
                .updatedAt(item.getUpdatedAt())
                .build();
    }
}
