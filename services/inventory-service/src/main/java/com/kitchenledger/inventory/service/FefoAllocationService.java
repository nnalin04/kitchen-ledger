package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.exception.ResourceNotFoundException;
import com.kitchenledger.inventory.model.StockReceiptItem;
import com.kitchenledger.inventory.repository.StockReceiptItemRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * FEFO (First Expired, First Out) allocation service.
 *
 * Determines which batches to consume and in what order when stock is deducted
 * from waste, recipe usage, or transfer paths. Batches without an expiry date
 * are treated as non-perishable and consumed last.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class FefoAllocationService {

    private final StockReceiptItemRepository batchRepository;

    /**
     * Immutable record describing how much to take from a specific batch.
     */
    public record BatchAllocation(UUID batchId, BigDecimal allocatedQuantity) {}

    /**
     * Compute FEFO allocations for a deduction of {@code quantity} units from {@code itemId}.
     * Does NOT persist changes — call {@link #applyAllocations} to write to the DB.
     *
     * @return list of allocations (may be partial if insufficient batch stock exists)
     */
    @Transactional(readOnly = true)
    public List<BatchAllocation> allocate(UUID tenantId, UUID itemId, BigDecimal quantity) {
        List<StockReceiptItem> batches = batchRepository.findAvailableBatchesByItemFefo(tenantId, itemId);

        List<BatchAllocation> allocations = new ArrayList<>();
        BigDecimal remaining = quantity.setScale(4, RoundingMode.HALF_UP);

        for (StockReceiptItem batch : batches) {
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;

            BigDecimal take = remaining.min(batch.getRemainingQuantity()).setScale(4, RoundingMode.HALF_UP);
            allocations.add(new BatchAllocation(batch.getId(), take));
            remaining = remaining.subtract(take);
        }

        if (remaining.compareTo(BigDecimal.ZERO) > 0) {
            log.warn("FEFO allocation for item {} could not fully satisfy {} units — {} units unallocated (no tracked batches)",
                    itemId, quantity, remaining);
        }

        return allocations;
    }

    /**
     * Persist FEFO allocations by decrementing {@code remainingQuantity} on each affected batch.
     * Must be called within an existing transaction.
     */
    @Transactional
    public void applyAllocations(List<BatchAllocation> allocations) {
        for (BatchAllocation allocation : allocations) {
            StockReceiptItem batch = batchRepository.findById(allocation.batchId())
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Batch not found: " + allocation.batchId()));

            BigDecimal newRemaining = batch.getRemainingQuantity()
                    .subtract(allocation.allocatedQuantity())
                    .max(BigDecimal.ZERO)
                    .setScale(4, RoundingMode.HALF_UP);

            batch.setRemainingQuantity(newRemaining);
            batchRepository.save(batch);

            log.debug("FEFO: batch {} decremented by {} → remaining {}",
                    batch.getId(), allocation.allocatedQuantity(), newRemaining);
        }
    }
}
