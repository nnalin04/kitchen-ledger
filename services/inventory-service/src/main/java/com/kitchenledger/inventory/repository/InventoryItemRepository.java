package com.kitchenledger.inventory.repository;

import com.kitchenledger.inventory.model.InventoryItem;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;


public interface InventoryItemRepository extends JpaRepository<InventoryItem, UUID> {

    Optional<InventoryItem> findByIdAndTenantIdAndDeletedAtIsNull(UUID id, UUID tenantId);

    boolean existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(UUID tenantId, String name);

    Optional<InventoryItem> findByTenantIdAndBarcodeAndDeletedAtIsNull(UUID tenantId, String barcode);

    List<InventoryItem> findByTenantIdAndDeletedAtIsNull(UUID tenantId);

    @Query("""
        SELECT i FROM InventoryItem i
        WHERE i.tenantId = :tenantId
          AND i.deletedAt IS NULL
          AND (:search IS NULL
               OR LOWER(i.name) LIKE LOWER(CONCAT('%', :search, '%'))
               OR i.sku LIKE CONCAT('%', :search, '%'))
          AND (:abcCategory IS NULL OR CAST(i.abcCategory AS string) = :abcCategory)
          AND (:lowStockOnly = false OR (i.parLevel IS NOT NULL AND i.currentStock < i.parLevel))
        """)
    Page<InventoryItem> findWithFilters(
            @Param("tenantId") UUID tenantId,
            @Param("search") String search,
            @Param("abcCategory") String abcCategory,
            @Param("lowStockOnly") boolean lowStockOnly,
            Pageable pageable);

    /** Items where currentStock < parLevel (for low-stock alerts). */
    @Query("""
        SELECT i FROM InventoryItem i
        WHERE i.tenantId = :tenantId
          AND i.deletedAt IS NULL
          AND i.parLevel IS NOT NULL
          AND i.currentStock < i.parLevel
        """)
    List<InventoryItem> findBelowParLevel(@Param("tenantId") UUID tenantId);

    // ── Scheduled-job queries ────────────────────────────────────────────────

    /** All items below PAR across every tenant — used by the hourly low-stock alert job. */
    @Query("""
        SELECT i FROM InventoryItem i
        WHERE i.deletedAt IS NULL
          AND i.parLevel IS NOT NULL
          AND i.currentStock <= i.parLevel
        """)
    List<InventoryItem> findAllBelowParLevel();

    /** Distinct tenant IDs that have at least one active (non-deleted) item. */
    @Query(value = "SELECT DISTINCT i.tenant_id FROM inventory_items i WHERE i.deleted_at IS NULL",
           nativeQuery = true)
    List<UUID> findDistinctTenantsWithActiveItems();

    /**
     * All active items for a tenant ordered by stock value
     * (COALESCE(avg_cost,0) * COALESCE(current_stock,0)) DESC — used by ABC re-classification.
     */
    @Query(value = """
        SELECT * FROM inventory_items i
        WHERE i.tenant_id = :tenantId
          AND i.deleted_at IS NULL
        ORDER BY (COALESCE(i.avg_cost, 0) * COALESCE(i.current_stock, 0)) DESC
        """, nativeQuery = true)
    List<InventoryItem> findByTenantIdAndDeletedAtIsNullOrderByStockValueDesc(@Param("tenantId") UUID tenantId);

    // ── Mobile sync queries ──────────────────────────────────────────────────

    /** Items created after the given timestamp (for mobile pull sync — created set). */
    List<InventoryItem> findByTenantIdAndCreatedAtAfterAndDeletedAtIsNull(UUID tenantId, Instant since);

    /**
     * Items updated after {@code updatedSince} but created before {@code createdBefore}
     * (for mobile pull sync — updated set, excludes brand-new items already in created).
     */
    List<InventoryItem> findByTenantIdAndUpdatedAtAfterAndCreatedAtBeforeAndDeletedAtIsNull(
            UUID tenantId, Instant updatedSince, Instant createdBefore);

    /** IDs of items soft-deleted after the given timestamp (for mobile pull sync — deleted set). */
    @Query("SELECT i.id FROM InventoryItem i WHERE i.tenantId = :tenantId AND i.deletedAt > :since")
    List<UUID> findIdsByTenantIdAndDeletedAtAfter(@Param("tenantId") UUID tenantId,
                                                   @Param("since") Instant since);

    /**
     * Case-insensitive name lookup — used by AI Service OCR catalog matching.
     * Callers should pass names already lowercased.
     */
    @Query("""
        SELECT i FROM InventoryItem i
        WHERE i.tenantId = :tenantId
          AND i.deletedAt IS NULL
          AND LOWER(i.name) IN :lowerNames
        """)
    List<InventoryItem> findByTenantIdAndNameInIgnoreCaseAndDeletedAtIsNull(
            @Param("tenantId") UUID tenantId,
            @Param("lowerNames") List<String> lowerNames);
}
