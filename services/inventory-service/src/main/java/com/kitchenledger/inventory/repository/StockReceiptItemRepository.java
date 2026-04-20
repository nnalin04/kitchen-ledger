package com.kitchenledger.inventory.repository;

import com.kitchenledger.inventory.model.StockReceiptItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public interface StockReceiptItemRepository extends JpaRepository<StockReceiptItem, UUID> {

    List<StockReceiptItem> findByStockReceiptId(UUID stockReceiptId);

    void deleteByStockReceiptId(UUID stockReceiptId);

    /**
     * FEFO query: returns available batches for an item ordered by expiry date ascending
     * (earliest-expiry first), with null-expiry batches at the end.
     * Only includes batches from confirmed receipts with remaining_quantity > 0.
     */
    @Query("""
            SELECT sri FROM StockReceiptItem sri
            JOIN StockReceipt sr ON sr.id = sri.stockReceiptId
            WHERE sr.tenantId = :tenantId
              AND sri.inventoryItemId = :itemId
              AND sr.confirmed = true
              AND sri.remainingQuantity > 0
            ORDER BY
              CASE WHEN sri.expiryDate IS NULL THEN 1 ELSE 0 END,
              sri.expiryDate ASC,
              sr.confirmedAt ASC
            """)
    List<StockReceiptItem> findAvailableBatchesByItemFefo(
            @Param("tenantId") UUID tenantId,
            @Param("itemId") UUID itemId);

    /**
     * Returns confirmed receipt items expiring on or before {@code threshold} for a specific tenant.
     * Used by ExpiryCheckJob for per-tenant queries.
     */
    @Query("""
            SELECT sri FROM StockReceiptItem sri
            JOIN StockReceipt sr ON sr.id = sri.stockReceiptId
            WHERE sr.tenantId = :tenantId
              AND sr.confirmed = true
              AND sri.expiryDate IS NOT NULL
              AND sri.expiryDate <= :threshold
              AND sri.expiryDate >= CURRENT_DATE
            ORDER BY sri.expiryDate ASC
            """)
    List<StockReceiptItem> findExpiringSoon(
            @Param("tenantId") UUID tenantId,
            @Param("threshold") LocalDate threshold);

    /**
     * Returns confirmed receipt items expiring on or before {@code threshold} across all tenants.
     * Used by ExpiryCheckJob when iterating all active tenants is not feasible.
     */
    @Query("""
            SELECT sri FROM StockReceiptItem sri
            JOIN StockReceipt sr ON sr.id = sri.stockReceiptId
            WHERE sr.confirmed = true
              AND sri.expiryDate IS NOT NULL
              AND sri.expiryDate <= :threshold
              AND sri.expiryDate >= CURRENT_DATE
            ORDER BY sri.expiryDate ASC
            """)
    List<StockReceiptItem> findAllExpiringSoon(@Param("threshold") LocalDate threshold);
}
