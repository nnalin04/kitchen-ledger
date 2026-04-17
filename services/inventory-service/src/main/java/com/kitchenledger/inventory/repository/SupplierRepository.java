package com.kitchenledger.inventory.repository;

import com.kitchenledger.inventory.model.Supplier;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SupplierRepository extends JpaRepository<Supplier, UUID> {

    Optional<Supplier> findByIdAndTenantIdAndDeletedAtIsNull(UUID id, UUID tenantId);

    List<Supplier> findByTenantIdAndDeletedAtIsNull(UUID tenantId);

    boolean existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(UUID tenantId, String name);
}
