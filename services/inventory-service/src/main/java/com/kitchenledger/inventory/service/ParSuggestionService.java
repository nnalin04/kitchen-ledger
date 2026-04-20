package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.exception.ResourceNotFoundException;
import com.kitchenledger.inventory.exception.ValidationException;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.PoSuggestion;
import com.kitchenledger.inventory.model.enums.PoSuggestionStatus;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.PoSuggestionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ParSuggestionService {

    private final InventoryItemRepository itemRepository;
    private final PoSuggestionRepository suggestionRepository;
    private final InventoryEventPublisher eventPublisher;

    /**
     * PAR formula: (avgDailyUsage * leadTimeDays) + safetyStock
     * All values expressed in the item's recipe unit.
     */
    public static BigDecimal computeParLevel(
            BigDecimal avgDailyUsage, int leadTimeDays, BigDecimal safetyStock) {
        return avgDailyUsage
                .multiply(BigDecimal.valueOf(leadTimeDays))
                .add(safetyStock)
                .setScale(4, RoundingMode.HALF_UP);
    }

    /**
     * Scans all items below PAR for a tenant and generates pending PO suggestions.
     * Skips items that already have a pending suggestion to prevent duplicates.
     *
     * @return number of new suggestions created
     */
    @Transactional
    public int generateSuggestions(UUID tenantId) {
        var belowPar = itemRepository.findBelowParLevel(tenantId);
        int created = 0;

        for (InventoryItem item : belowPar) {
            if (suggestionRepository.existsByTenantIdAndInventoryItemIdAndStatus(
                    tenantId, item.getId(), PoSuggestionStatus.pending)) {
                log.debug("Skipping item {} — pending suggestion already exists", item.getId());
                continue;
            }

            BigDecimal parLevel = item.getParLevel() != null
                    ? item.getParLevel() : BigDecimal.ZERO;
            BigDecimal gap = parLevel.subtract(item.getCurrentStock())
                    .max(BigDecimal.ZERO)
                    .setScale(4, RoundingMode.HALF_UP);

            PoSuggestion suggestion = suggestionRepository.save(
                    PoSuggestion.builder()
                            .tenantId(tenantId)
                            .inventoryItemId(item.getId())
                            .suggestedQuantity(gap)
                            .currentStock(item.getCurrentStock())
                            .parLevel(parLevel)
                            .status(PoSuggestionStatus.pending)
                            .build()
            );

            eventPublisher.publishStockLow(tenantId, item, suggestion.getId());
            created++;
            log.info("Created PO suggestion {} for item {} (gap={})",
                    suggestion.getId(), item.getName(), gap);
        }

        return created;
    }

    @Transactional(readOnly = true)
    public Page<PoSuggestion> list(UUID tenantId, PoSuggestionStatus status, Pageable pageable) {
        if (status != null) {
            return suggestionRepository.findByTenantIdAndStatus(tenantId, status, pageable);
        }
        return suggestionRepository.findByTenantId(tenantId, pageable);
    }

    @Transactional(readOnly = true)
    public PoSuggestion getById(UUID tenantId, UUID id) {
        return suggestionRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("PO suggestion not found: " + id));
    }

    @Transactional
    public PoSuggestion approve(UUID tenantId, UUID id, UUID approvedBy) {
        PoSuggestion suggestion = getById(tenantId, id);
        if (suggestion.getStatus() != PoSuggestionStatus.pending) {
            throw new ValidationException(
                    "Approve is allowed for only pending suggestions. Current status: " + suggestion.getStatus());
        }
        suggestion.setStatus(PoSuggestionStatus.approved);
        suggestion.setApprovedBy(approvedBy);
        return suggestionRepository.save(suggestion);
    }

    @Transactional
    public PoSuggestion reject(UUID tenantId, UUID id) {
        PoSuggestion suggestion = getById(tenantId, id);
        if (suggestion.getStatus() != PoSuggestionStatus.pending) {
            throw new ValidationException(
                    "Can only reject pending suggestions. Current status: " + suggestion.getStatus());
        }
        suggestion.setStatus(PoSuggestionStatus.rejected);
        return suggestionRepository.save(suggestion);
    }
}
