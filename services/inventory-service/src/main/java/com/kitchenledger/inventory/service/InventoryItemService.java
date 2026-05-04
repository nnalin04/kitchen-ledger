package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.dto.request.CreateInventoryItemRequest;
import com.kitchenledger.inventory.dto.response.BulkImportResult;
import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.exception.ConflictException;
import com.kitchenledger.inventory.exception.ResourceNotFoundException;
import com.kitchenledger.inventory.exception.ValidationException;
import com.kitchenledger.inventory.model.InventoryCategory;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.InventoryMovement;
import com.kitchenledger.inventory.model.enums.AbcCategory;
import com.kitchenledger.inventory.model.enums.MovementType;
import com.kitchenledger.inventory.repository.InventoryCategoryRepository;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.InventoryMovementRepository;
import com.kitchenledger.inventory.repository.StockReceiptItemRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class InventoryItemService {

    private final InventoryItemRepository itemRepository;
    private final InventoryMovementRepository movementRepository;
    private final InventoryEventPublisher eventPublisher;
    private final InventoryCategoryRepository categoryRepository;
    private final StockReceiptItemRepository stockReceiptItemRepository;

    @Transactional(readOnly = true)
    public Page<InventoryItem> list(UUID tenantId, String search, String abcCategory,
                                    boolean lowStockOnly, Pageable pageable) {
        // Pre-compute search pattern on Java side to avoid Hibernate 6 bytea type inference for null strings
        String searchPattern = (search != null && !search.isBlank())
                ? "%" + search.toLowerCase() + "%" : null;
        return itemRepository.findWithFilters(tenantId, searchPattern, abcCategory, lowStockOnly, pageable);
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

    /**
     * Returns perishable items that have batches expiring within their expiryAlertDays window.
     * Uses StockReceiptItems to find actual expiry dates per batch.
     */
    @Transactional(readOnly = true)
    public List<InventoryItem> getExpiringSoon(UUID tenantId) {
        // Find all perishable items for tenant
        List<InventoryItem> perishables = itemRepository.findByTenantIdAndDeletedAtIsNull(tenantId)
                .stream()
                .filter(InventoryItem::isPerishable)
                .toList();

        // For each perishable item, check if any batch expires within expiryAlertDays
        List<InventoryItem> expiring = new ArrayList<>();
        for (InventoryItem item : perishables) {
            LocalDate threshold = LocalDate.now().plusDays(item.getExpiryAlertDays());
            boolean hasBatchExpiringSoon = stockReceiptItemRepository
                    .findExpiringSoon(tenantId, threshold)
                    .stream()
                    .anyMatch(sri -> sri.getInventoryItemId().equals(item.getId()));
            if (hasBatchExpiringSoon) {
                expiring.add(item);
            }
        }
        return expiring;
    }

    /**
     * Bulk import inventory items from CSV.
     * Columns: name, category_name, purchase_unit, recipe_unit, count_unit,
     *          par_level, reorder_quantity, abc_category, is_perishable
     * Validates all rows before persisting. Collects all errors (does not fail fast).
     */
    @Transactional
    public BulkImportResult bulkImport(UUID tenantId, UUID userId, MultipartFile csvFile) {
        List<String> validationErrors = new ArrayList<>();
        List<InventoryItem> toCreate = new ArrayList<>();
        // Cache category lookups within this import
        Map<String, UUID> categoryCache = new HashMap<>();

        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(csvFile.getInputStream(), StandardCharsets.UTF_8))) {

            String headerLine = reader.readLine();
            if (headerLine == null) {
                throw new ValidationException("CSV file is empty");
            }

            String line;
            int rowNum = 1;
            while ((line = reader.readLine()) != null) {
                rowNum++;
                if (line.isBlank()) continue;

                String[] cols = line.split(",", -1);

                // Strip surrounding whitespace/quotes from each cell
                for (int i = 0; i < cols.length; i++) {
                    cols[i] = cols[i].trim().replaceAll("^\"|\"$", "");
                }

                String name             = cols.length > 0 ? cols[0] : "";
                String categoryName     = cols.length > 1 ? cols[1] : "";
                String purchaseUnit     = cols.length > 2 ? cols[2] : "";
                String recipeUnit       = cols.length > 3 ? cols[3] : "";
                String countUnit        = cols.length > 4 ? cols[4] : "";
                String parLevelStr      = cols.length > 5 ? cols[5] : "";
                String reorderQtyStr    = cols.length > 6 ? cols[6] : "";
                String abcCategoryStr   = cols.length > 7 ? cols[7] : "";
                String isPerishableStr  = cols.length > 8 ? cols[8] : "";

                // Validate name
                if (name.isBlank()) {
                    validationErrors.add("Row " + rowNum + ": name is required");
                    continue;
                }

                // Validate abc_category
                AbcCategory abcCategory = AbcCategory.C;
                if (!abcCategoryStr.isBlank()) {
                    try {
                        abcCategory = AbcCategory.valueOf(abcCategoryStr.toUpperCase());
                    } catch (IllegalArgumentException e) {
                        validationErrors.add("Row " + rowNum + ": abc_category must be A, B, or C (got '"
                                + abcCategoryStr + "')");
                        continue;
                    }
                }

                // Validate par_level
                BigDecimal parLevel = null;
                if (!parLevelStr.isBlank()) {
                    try {
                        parLevel = new BigDecimal(parLevelStr);
                    } catch (NumberFormatException e) {
                        validationErrors.add("Row " + rowNum + ": par_level must be a valid number");
                        continue;
                    }
                }

                // Validate reorder_quantity
                BigDecimal reorderQuantity = null;
                if (!reorderQtyStr.isBlank()) {
                    try {
                        reorderQuantity = new BigDecimal(reorderQtyStr);
                    } catch (NumberFormatException e) {
                        validationErrors.add("Row " + rowNum + ": reorder_quantity must be a valid number");
                        continue;
                    }
                }

                boolean isPerishable = "true".equalsIgnoreCase(isPerishableStr);

                // Resolve or create category
                UUID categoryId = null;
                if (!categoryName.isBlank()) {
                    if (categoryCache.containsKey(categoryName.toLowerCase())) {
                        categoryId = categoryCache.get(categoryName.toLowerCase());
                    } else {
                        categoryId = categoryRepository
                                .findByTenantIdAndDeletedAtIsNullOrderBySortOrderAsc(tenantId)
                                .stream()
                                .filter(c -> c.getName().equalsIgnoreCase(categoryName))
                                .findFirst()
                                .map(InventoryCategory::getId)
                                .orElseGet(() -> {
                                    InventoryCategory newCat = categoryRepository.save(
                                            InventoryCategory.builder()
                                                    .tenantId(tenantId)
                                                    .name(categoryName)
                                                    .sortOrder(0)
                                                    .build()
                                    );
                                    return newCat.getId();
                                });
                        categoryCache.put(categoryName.toLowerCase(), categoryId);
                    }
                }

                String effectivePurchaseUnit = purchaseUnit.isBlank() ? "unit" : purchaseUnit;
                String effectiveRecipeUnit   = recipeUnit.isBlank()   ? "unit" : recipeUnit;
                String effectiveCountUnit    = countUnit.isBlank()    ? "unit" : countUnit;

                toCreate.add(InventoryItem.builder()
                        .tenantId(tenantId)
                        .name(name)
                        .categoryId(categoryId)
                        .purchaseUnit(effectivePurchaseUnit)
                        .recipeUnit(effectiveRecipeUnit)
                        .countUnit(effectiveCountUnit)
                        .parLevel(parLevel)
                        .reorderQuantity(reorderQuantity)
                        .abcCategory(abcCategory)
                        .perishable(isPerishable)
                        .build());
            }
        } catch (ValidationException ve) {
            throw ve;
        } catch (Exception e) {
            throw new ValidationException("Failed to parse CSV: " + e.getMessage());
        }

        if (!validationErrors.isEmpty()) {
            throw new ValidationException(String.join("; ", validationErrors));
        }

        List<InventoryItem> saved = itemRepository.saveAll(toCreate);

        return BulkImportResult.builder()
                .created(saved.size())
                .skipped(0)
                .errors(List.of())
                .build();
    }
}
