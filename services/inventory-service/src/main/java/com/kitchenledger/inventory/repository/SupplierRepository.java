package com.kitchenledger.inventory.repository;

import com.kitchenledger.inventory.model.Supplier;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface SupplierRepository extends JpaRepository<Supplier, UUID> {

    Optional<Supplier> findByIdAndTenantIdAndDeletedAtIsNull(UUID id, UUID tenantId);

    List<Supplier> findByTenantIdAndDeletedAtIsNull(UUID tenantId);

    Page<Supplier> findByTenantIdAndDeletedAtIsNull(UUID tenantId, Pageable pageable);

    boolean existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(UUID tenantId, String name);
}
