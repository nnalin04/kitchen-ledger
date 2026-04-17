package com.kitchenledger.inventory.repository;

import com.kitchenledger.inventory.model.InventoryCategory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface InventoryCategoryRepository extends JpaRepository<InventoryCategory, UUID> {

    List<InventoryCategory> findByTenantIdAndDeletedAtIsNullOrderBySortOrderAsc(UUID tenantId);

    Optional<InventoryCategory> findByIdAndTenantIdAndDeletedAtIsNull(UUID id, UUID tenantId);

    boolean existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(UUID tenantId, String name);
}
