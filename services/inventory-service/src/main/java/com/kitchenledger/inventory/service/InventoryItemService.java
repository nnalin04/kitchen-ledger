package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.dto.request.CreateInventoryItemRequest;
import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.exception.ConflictException;
import com.kitchenledger.inventory.exception.ResourceNotFoundException;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.InventoryMovement;
import com.kitchenledger.inventory.model.enums.MovementType;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.InventoryMovementRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class InventoryItemService {

    private final InventoryItemRepository itemRepository;
    private final InventoryMovementRepository movementRepository;
    private final InventoryEventPublisher eventPublisher;

    @Transactional(readOnly = true)
    public Page<InventoryItem> list(UUID tenantId, String search, String abcCategory,
                                    boolean lowStockOnly, Pageable pageable) {
        return itemRepository.findWithFilters(tenantId, search, abcCategory, lowStockOnly, pageable);
    }

    @Transactional(readOnly = true)
    public InventoryItem getById(UUID tenantId, UUID id) {
        return itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Inventory item not found: " + id));
    }

    @Transactional(readOnly = true)
    public List<InventoryItem> getBelowPar(UUID tenantId) {
        return itemRepository.findBelowParLevel(tenantId);
    }

    @Transactional
    public InventoryItem create(UUID tenantId, CreateInventoryItemRequest req) {
        if (itemRepository.existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(tenantId, req.getName())) {
            throw new ConflictException("Item with this name already exists: " + req.getName());
        }
        InventoryItem item = InventoryItem.builder()
                .tenantId(tenantId)
                .categoryId(req.getCategoryId())
                .name(req.getName())
                .sku(req.getSku())
                .barcode(req.getBarcode())
                .description(req.getDescription())
                .purchaseUnit(req.getPurchaseUnit())
                .purchaseUnitQty(req.getPurchaseUnitQty())
                .recipeUnit(req.getRecipeUnit())
                .countUnit(req.getCountUnit())
                .purchaseToRecipeFactor(req.getPurchaseToRecipeFactor())
                .recipeToCountFactor(req.getRecipeToCountFactor())
                .parLevel(req.getParLevel())
                .reorderQuantity(req.getReorderQuantity())
                .safetyStock(req.getSafetyStock())
                .priceAlertThreshold(req.getPriceAlertThreshold())
                .perishable(req.isPerishable())
                .shelfLifeDays(req.getShelfLifeDays())
                .expiryAlertDays(req.getExpiryAlertDays())
                .storageLocation(req.getStorageLocation())
                .primarySupplierId(req.getPrimarySupplierId())
                .notes(req.getNotes())
                .imageUrl(req.getImageUrl())
                .build();
        return itemRepository.save(item);
    }

    @Transactional
    public InventoryItem update(UUID tenantId, UUID id, CreateInventoryItemRequest req) {
        InventoryItem item = getById(tenantId, id);
        if (!item.getName().equalsIgnoreCase(req.getName())
                && itemRepository.existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(tenantId, req.getName())) {
            throw new ConflictException("Item with this name already exists: " + req.getName());
        }
        item.setCategoryId(req.getCategoryId());
        item.setName(req.getName());
        item.setSku(req.getSku());
        item.setBarcode(req.getBarcode());
        item.setDescription(req.getDescription());
        item.setPurchaseUnit(req.getPurchaseUnit());
        item.setPurchaseUnitQty(req.getPurchaseUnitQty());
        item.setRecipeUnit(req.getRecipeUnit());
        item.setCountUnit(req.getCountUnit());
        item.setPurchaseToRecipeFactor(req.getPurchaseToRecipeFactor());
        item.setRecipeToCountFactor(req.getRecipeToCountFactor());
        item.setParLevel(req.getParLevel());
        item.setReorderQuantity(req.getReorderQuantity());
        item.setSafetyStock(req.getSafetyStock());
        item.setPriceAlertThreshold(req.getPriceAlertThreshold());
        item.setPerishable(req.isPerishable());
        item.setShelfLifeDays(req.getShelfLifeDays());
        item.setExpiryAlertDays(req.getExpiryAlertDays());
        item.setStorageLocation(req.getStorageLocation());
        item.setPrimarySupplierId(req.getPrimarySupplierId());
        item.setNotes(req.getNotes());
        item.setImageUrl(req.getImageUrl());
        return itemRepository.save(item);
    }

    @Transactional
    public void delete(UUID tenantId, UUID id) {
        InventoryItem item = getById(tenantId, id);
        item.setDeletedAt(Instant.now());
        item.setActive(false);
        itemRepository.save(item);
    }

    /**
     * Manual stock adjustment (positive = add, negative = remove).
     * Writes to the movement ledger and fires a stock-low event if applicable.
     */
    @Transactional
    public InventoryItem adjustStock(UUID tenantId, UUID id, BigDecimal delta,
                                     String unit, String reason, UUID performedBy) {
        InventoryItem item = getById(tenantId, id);
        item.setCurrentStock(item.getCurrentStock().add(delta));
        itemRepository.save(item);

        movementRepository.save(InventoryMovement.builder()
                .tenantId(tenantId)
                .inventoryItemId(item.getId())
                .movementType(MovementType.count_adjust)
                .quantityDelta(delta)
                .unit(unit)
                .notes(reason)
                .performedBy(performedBy)
                .build());

        if (item.isBelowPar()) {
            eventPublisher.publishStockLow(tenantId, item);
        }
        return item;
    }

    /**
     * Sets opening stock (one-time init movement for a new item).
     */
    @Transactional
    public InventoryItem setOpeningStock(UUID tenantId, UUID id, BigDecimal quantity,
                                          BigDecimal unitCost, UUID performedBy) {
        InventoryItem item = getById(tenantId, id);
        item.setCurrentStock(quantity);
        item.setAvgCost(unitCost);
        itemRepository.save(item);

        movementRepository.save(InventoryMovement.builder()
                .tenantId(tenantId)
                .inventoryItemId(item.getId())
                .movementType(MovementType.opening_stock)
                .quantityDelta(quantity)
                .unit(item.getCountUnit())
                .unitCost(unitCost)
                .notes("Opening stock entry")
                .performedBy(performedBy)
                .build());

        return item;
    }
}
