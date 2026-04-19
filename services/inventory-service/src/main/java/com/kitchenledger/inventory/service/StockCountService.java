package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.dto.*;
import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.model.InventoryCount;
import com.kitchenledger.inventory.model.InventoryCountItem;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.enums.AbcCategory;
import com.kitchenledger.inventory.model.enums.CountStatus;
import com.kitchenledger.inventory.model.enums.CountType;
import com.kitchenledger.inventory.repository.InventoryCountRepository;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.security.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class StockCountService {

    private final InventoryCountRepository countRepository;
    private final InventoryItemRepository itemRepository;
    private final InventoryEventPublisher eventPublisher;

    @Transactional
    public InventoryCountResponse startCount(CreateCountRequest request) {
        UUID tenantId = UUID.fromString(TenantContext.get());
        UUID userId = UUID.fromString(TenantContext.getUserId());

        AbcCategory abcFilter = request.getAbcFilter() != null ? AbcCategory.fromValue(request.getAbcFilter()) : null;
        CountType type = CountType.fromValue(request.getCountType());

        if (type == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid count type");
        }
        if (type == CountType.CYCLE && abcFilter == null) {
            abcFilter = AbcCategory.A; // Default to 'A' class items for cycle counts
        }

        InventoryCount count = InventoryCount.builder()
                .tenantId(tenantId)
                .countType(type)
                .abcFilter(abcFilter)
                .status(CountStatus.IN_PROGRESS)
                .countDate(LocalDate.now())
                .countedBy(userId)
                .notes(request.getNotes())
                .build();

        count = countRepository.save(count);
        return mapToResponse(count);
    }

    @Transactional(readOnly = true)
    public Page<InventoryCountResponse> getCounts(Pageable pageable) {
        UUID tenantId = UUID.fromString(TenantContext.get());
        return countRepository.findByTenantId(tenantId, pageable).map(this::mapToResponse);
    }

    @Transactional(readOnly = true)
    public InventoryCountResponse getCount(UUID id) {
        return mapToResponse(getCountEntity(id));
    }

    @Transactional
    public void submitItems(UUID countId, CountItemListRequest request) {
        InventoryCount count = getCountEntity(countId);
        if (count.getStatus() != CountStatus.IN_PROGRESS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Count is not in progress");
        }

        UUID tenantId = UUID.fromString(TenantContext.get());

        for (CountItemRequest reqItem : request.getItems()) {
            InventoryItem item = itemRepository.findByIdAndTenantId(reqItem.getInventoryItemId(), tenantId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Item not found: " + reqItem.getInventoryItemId()));

            InventoryCountItem countItem = InventoryCountItem.builder()
                    .inventoryItem(item)
                    .expectedQuantity(item.getCurrentStock())
                    .countedQuantity(reqItem.getCountedQuantity())
                    .unit(reqItem.getUnit() != null ? reqItem.getUnit() : item.getCountUnit())
                    .unitCost(item.getAvgCost())
                    .notes(reqItem.getNotes())
                    .countedAt(Instant.now())
                    .build();

            count.addItem(countItem);
        }

        countRepository.save(count);
    }

    @Transactional
    public InventoryCountResponse completeCount(UUID countId) {
        InventoryCount count = getCountEntity(countId);
        if (count.getStatus() != CountStatus.IN_PROGRESS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Count is not in progress");
        }

        BigDecimal totalVarianceCost = BigDecimal.ZERO;

        for (InventoryCountItem item : count.getItems()) {
            BigDecimal varianceQty = item.getCountedQuantity().subtract(item.getExpectedQuantity());
            BigDecimal varianceCost = varianceQty.multiply(item.getUnitCost());
            
            // Note: Since varianceQuantity is an updatable=false formula column in the schema, we shouldn't explicitly set it.
            // Wait, schema has it as `GENERATED ALWAYS AS (counted_quantity - expected_quantity) STORED`
            // and `variance_cost` is `GENERATED ALWAYS AS ((counted_quantity - expected_quantity) * unit_cost) STORED`.
            // So we don't set varianceQty or varianceCost on the entity if they are generated by DB.
            // Oh, but I have it defined as @Column(name = "variance_cost") updatable=true mapped, wait let me check the sql.
            // Instead, I'll calculate it just for the totalVarianceCost locally.
            totalVarianceCost = totalVarianceCost.add(varianceCost);

            // Update the inventory item's current stock (we update to counted qty)
            InventoryItem inventoryItem = item.getInventoryItem();
            inventoryItem.setCurrentStock(item.getCountedQuantity());
            itemRepository.save(inventoryItem);
        }

        count.setStatus(CountStatus.COMPLETED);
        count.setCompletedAt(Instant.now());
        // Do not update total_variance_cost here if it's generated, wait, let me check the DB schema.
        // Actually the schema has: `total_variance_cost DECIMAL(12, 2)` (not generated) in `inventory_counts`.
        count.setTotalVarianceCost(totalVarianceCost);
        countRepository.save(count);
        
        UUID tenantId = UUID.fromString(TenantContext.get());

        // Publish event for completed count.
        // Alert on variance cost if it's significant (e.g. over $100 discrepency either direction).
        if (totalVarianceCost.abs().compareTo(new BigDecimal("100")) > 0) {
            // Publisher handles finance events
            eventPublisher.publishInventoryAdjusted(tenantId, countId, totalVarianceCost, "Count variance exceeding threshold");
        }
        
        return mapToResponse(count);
    }

    @Transactional(readOnly = true)
    public CountVarianceResponse getCountVariance(UUID countId) {
        InventoryCount count = getCountEntity(countId);
        
        List<CountItemVarianceResponse> items = count.getItems().stream().map(i -> {
            BigDecimal varianceQty = i.getCountedQuantity().subtract(i.getExpectedQuantity());
            BigDecimal varianceCost = varianceQty.multiply(i.getUnitCost());
            
            return CountItemVarianceResponse.builder()
                .inventoryItemId(i.getInventoryItem().getId())
                .expectedQuantity(i.getExpectedQuantity())
                .countedQuantity(i.getCountedQuantity())
                .varianceQuantity(varianceQty)
                .unit(i.getUnit())
                .unitCost(i.getUnitCost())
                .varianceCost(varianceCost)
                .build();
        }).collect(Collectors.toList());

        return CountVarianceResponse.builder()
                .inventoryCount(mapToResponse(count))
                .totalVarianceCost(count.getTotalVarianceCost())
                .items(items)
                .build();
    }

    private InventoryCount getCountEntity(UUID id) {
        UUID tenantId = UUID.fromString(TenantContext.get());
        return countRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Inventory count not found"));
    }

    private InventoryCountResponse mapToResponse(InventoryCount count) {
        return InventoryCountResponse.builder()
                .id(count.getId())
                .countType(count.getCountType().getValue())
                .abcFilter(count.getAbcFilter() != null ? count.getAbcFilter().getValue() : null)
                .status(count.getStatus().getValue())
                .countDate(count.getCountDate())
                .startedAt(count.getStartedAt())
                .completedAt(count.getCompletedAt())
                .countedBy(count.getCountedBy())
                .notes(count.getNotes())
                .totalVarianceCost(count.getTotalVarianceCost())
                .build();
    }
}
