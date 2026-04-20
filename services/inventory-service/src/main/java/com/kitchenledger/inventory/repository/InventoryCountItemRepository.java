package com.kitchenledger.inventory.repository;

import com.kitchenledger.inventory.model.InventoryCountItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface InventoryCountItemRepository extends JpaRepository<InventoryCountItem, UUID> {

    @Query("SELECT ci FROM InventoryCountItem ci WHERE ci.inventoryCount.tenantId = :tenantId")
    List<InventoryCountItem> findByTenantId(UUID tenantId);
}
