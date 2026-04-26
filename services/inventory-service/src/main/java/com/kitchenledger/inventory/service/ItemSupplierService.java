package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.exception.ConflictException;
import com.kitchenledger.inventory.exception.ResourceNotFoundException;
import com.kitchenledger.inventory.exception.ValidationException;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.InventoryItemSupplier;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.InventoryItemSupplierRepository;
import com.kitchenledger.inventory.repository.SupplierRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class ItemSupplierService {

    private final InventoryItemSupplierRepository itemSupplierRepository;
    private final InventoryItemRepository itemRepository;
    private final SupplierRepository supplierRepository;
    private final InventoryEventPublisher eventPublisher;

    /**
     * Links a supplier to an item with unit price and optional preferred flag.
     * If isPreferred=true, clears the preferred flag on all other supplier links for the item.
     */
    public InventoryItemSupplier linkSupplier(UUID tenantId, UUID itemId, UUID supplierId,
                                               BigDecimal unitPrice, boolean isPreferred) {
        requireItem(tenantId, itemId);
        requireSupplier(tenantId, supplierId);

        if (itemSupplierRepository.existsByTenantIdAndInventoryItemIdAndSupplierId(tenantId, itemId, supplierId)) {
            throw new ConflictException("Supplier already linked to item");
        }

        InventoryItemSupplier link = InventoryItemSupplier.builder()
                .tenantId(tenantId)
                .inventoryItemId(itemId)
                .supplierId(supplierId)
                .unitPrice(unitPrice.setScale(4, RoundingMode.HALF_UP))
                .preferred(isPreferred)
                .build();

        InventoryItemSupplier saved = itemSupplierRepository.save(link);

        if (isPreferred) {
            itemSupplierRepository.clearPreferredExcept(tenantId, itemId, saved.getId());
        }

        return saved;
    }

    /**
     * Updates the unit price for a supplier-item link.
     * If the price delta exceeds the item's priceAlertThreshold, fires a price alert event.
     */
    public InventoryItemSupplier updateSupplierPrice(UUID tenantId, UUID itemId, UUID supplierId,
                                                      BigDecimal newPrice) {
        InventoryItemSupplier link = requireLink(tenantId, itemId, supplierId);
        InventoryItem item = requireItem(tenantId, itemId);

        BigDecimal oldPrice = link.getUnitPrice();
        BigDecimal scaledNew = newPrice.setScale(4, RoundingMode.HALF_UP);
        link.setUnitPrice(scaledNew);
        InventoryItemSupplier saved = itemSupplierRepository.save(link);

        if (oldPrice.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal deltaPercent = scaledNew.subtract(oldPrice)
                    .abs()
                    .divide(oldPrice, 4, RoundingMode.HALF_UP)
                    .multiply(new BigDecimal("100"))
                    .setScale(2, RoundingMode.HALF_UP);

            if (deltaPercent.compareTo(item.getPriceAlertThreshold()) > 0) {
                // Update item's last purchase price for context in the event
                item.setLastPurchasePrice(scaledNew);
                itemRepository.save(item);
                eventPublisher.publishPriceAlert(tenantId, item, deltaPercent);
            }
        }

        return saved;
    }

    /**
     * Unlinks a supplier from an item.
     * Cannot unlink the preferred supplier if it is the only supplier linked to the item.
     */
    public void unlinkSupplier(UUID tenantId, UUID itemId, UUID supplierId) {
        InventoryItemSupplier link = requireLink(tenantId, itemId, supplierId);

        if (link.isPreferred()) {
            long totalLinks = itemSupplierRepository.countByTenantIdAndInventoryItemId(tenantId, itemId);
            if (totalLinks <= 1) {
                throw new ValidationException(
                        "Cannot unlink the only preferred supplier. Assign another preferred supplier first.");
            }
        }

        itemSupplierRepository.delete(link);
    }

    @Transactional(readOnly = true)
    public List<InventoryItemSupplier> getItemSuppliers(UUID tenantId, UUID itemId) {
        requireItem(tenantId, itemId);
        return itemSupplierRepository.findByTenantIdAndInventoryItemId(tenantId, itemId);
    }

    // ── private helpers ───────────────────────────────────────────────────────

    private InventoryItem requireItem(UUID tenantId, UUID itemId) {
        return itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(itemId, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Inventory item not found: " + itemId));
    }

    private void requireSupplier(UUID tenantId, UUID supplierId) {
        if (!supplierRepository.existsByIdAndTenantIdAndDeletedAtIsNull(supplierId, tenantId)) {
            throw new ResourceNotFoundException("Supplier not found: " + supplierId);
        }
    }

    private InventoryItemSupplier requireLink(UUID tenantId, UUID itemId, UUID supplierId) {
        return itemSupplierRepository
                .findByTenantIdAndInventoryItemIdAndSupplierId(tenantId, itemId, supplierId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Supplier link not found for item " + itemId + " / supplier " + supplierId));
    }
}
