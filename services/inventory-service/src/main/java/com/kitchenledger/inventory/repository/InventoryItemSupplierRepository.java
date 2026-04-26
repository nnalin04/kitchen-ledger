package com.kitchenledger.inventory.repository;

import com.kitchenledger.inventory.model.InventoryItemSupplier;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InventoryItemSupplierRepository extends JpaRepository<InventoryItemSupplier, UUID> {

    List<InventoryItemSupplier> findByTenantIdAndInventoryItemId(UUID tenantId, UUID inventoryItemId);

    Optional<InventoryItemSupplier> findByTenantIdAndInventoryItemIdAndSupplierId(
            UUID tenantId, UUID inventoryItemId, UUID supplierId);

    boolean existsByTenantIdAndInventoryItemIdAndSupplierId(
            UUID tenantId, UUID inventoryItemId, UUID supplierId);

    long countByTenantIdAndInventoryItemId(UUID tenantId, UUID inventoryItemId);

    @Modifying
    @Query("""
        UPDATE InventoryItemSupplier s
        SET s.preferred = false
        WHERE s.tenantId = :tenantId
          AND s.inventoryItemId = :inventoryItemId
          AND s.id <> :excludeId
        """)
    int clearPreferredExcept(
            @Param("tenantId") UUID tenantId,
            @Param("inventoryItemId") UUID inventoryItemId,
            @Param("excludeId") UUID excludeId);
}
