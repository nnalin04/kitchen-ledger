package com.kitchenledger.inventory.repository;

import com.kitchenledger.inventory.model.InventoryMovement;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface InventoryMovementRepository extends JpaRepository<InventoryMovement, UUID> {

    Page<InventoryMovement> findByInventoryItemIdOrderByCreatedAtDesc(UUID itemId, Pageable pageable);

    List<InventoryMovement> findByTenantIdAndInventoryItemIdOrderByCreatedAtDesc(UUID tenantId, UUID itemId);
}
