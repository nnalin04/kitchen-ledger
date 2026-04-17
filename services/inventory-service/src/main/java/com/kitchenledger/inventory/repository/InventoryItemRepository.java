package com.kitchenledger.inventory.repository;

import com.kitchenledger.inventory.model.InventoryItem;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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
}
