package com.kitchenledger.inventory.repository;

import com.kitchenledger.inventory.model.InventoryCountItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface InventoryCountItemRepository extends JpaRepository<InventoryCountItem, UUID> {
}
