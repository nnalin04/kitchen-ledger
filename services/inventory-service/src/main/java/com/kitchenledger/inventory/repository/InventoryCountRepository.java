package com.kitchenledger.inventory.repository;

import com.kitchenledger.inventory.model.InventoryCount;
import com.kitchenledger.inventory.model.enums.CountStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface InventoryCountRepository extends JpaRepository<InventoryCount, UUID> {
    Optional<InventoryCount> findByIdAndTenantId(UUID id, UUID tenantId);
    Page<InventoryCount> findByTenantId(UUID tenantId, Pageable pageable);
    Page<InventoryCount> findByTenantIdAndStatus(UUID tenantId, CountStatus status, Pageable pageable);
    Page<InventoryCount> findByTenantIdAndCountDateBetween(UUID tenantId, LocalDate startDate, LocalDate endDate, Pageable pageable);
}
