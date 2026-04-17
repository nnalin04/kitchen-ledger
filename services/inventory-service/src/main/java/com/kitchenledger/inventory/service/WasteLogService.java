package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.dto.request.LogWasteRequest;
import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.exception.ResourceNotFoundException;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.InventoryMovement;
import com.kitchenledger.inventory.model.WasteLog;
import com.kitchenledger.inventory.model.enums.MovementType;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.InventoryMovementRepository;
import com.kitchenledger.inventory.repository.WasteLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class WasteLogService {

    private final WasteLogRepository wasteLogRepository;
    private final InventoryItemRepository itemRepository;
    private final InventoryMovementRepository movementRepository;
    private final InventoryEventPublisher eventPublisher;

    @Transactional(readOnly = true)
    public Page<WasteLog> list(UUID tenantId, Pageable pageable) {
        return wasteLogRepository.findByTenantIdOrderByLoggedAtDesc(tenantId, pageable);
    }

    @Transactional(readOnly = true)
    public BigDecimal totalWasteCost(UUID tenantId, Instant from, Instant to) {
        return wasteLogRepository.sumEstimatedCostByPeriod(tenantId, from, to);
    }

    /**
     * Logs waste, decrements stock, writes a movement record.
     * Fires stock-low event if stock drops below PAR after waste.
     */
    @Transactional
    public WasteLog logWaste(UUID tenantId, UUID loggedBy, LogWasteRequest req) {
        InventoryItem item = itemRepository
                .findByIdAndTenantIdAndDeletedAtIsNull(req.getInventoryItemId(), tenantId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Inventory item not found: " + req.getInventoryItemId()));

        // Decrement stock (quantity in the request's unit — assumes it's already in count_unit)
        BigDecimal newStock = item.getCurrentStock().subtract(req.getQuantity());
        item.setCurrentStock(newStock.max(BigDecimal.ZERO));
        itemRepository.save(item);

        // Movement ledger entry
        InventoryMovement movement = movementRepository.save(InventoryMovement.builder()
                .tenantId(tenantId)
                .inventoryItemId(item.getId())
                .movementType(MovementType.waste)
                .quantityDelta(req.getQuantity().negate())
                .unit(req.getUnit())
                .unitCost(item.getAvgCost())
                .notes(req.getReason().name())
                .performedBy(loggedBy)
                .build());

        // Estimate cost if not provided
        BigDecimal estimatedCost = req.getEstimatedCost() != null
                ? req.getEstimatedCost()
                : req.getQuantity().multiply(item.getAvgCost());

        WasteLog log = wasteLogRepository.save(WasteLog.builder()
                .tenantId(tenantId)
                .inventoryItemId(item.getId())
                .quantity(req.getQuantity())
                .unit(req.getUnit())
                .reason(req.getReason())
                .station(req.getStation())
                .estimatedCost(estimatedCost)
                .photoUrl(req.getPhotoUrl())
                .notes(req.getNotes())
                .loggedBy(loggedBy)
                .movementId(movement.getId())
                .build());

        if (item.isBelowPar()) {
            eventPublisher.publishStockLow(tenantId, item);
        }

        return log;
    }
}
