package com.kitchenledger.finance.repository;

import com.kitchenledger.finance.model.Vendor;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface VendorRepository extends JpaRepository<Vendor, UUID> {

    Optional<Vendor> findByIdAndTenantIdAndDeletedAtIsNull(UUID id, UUID tenantId);

    List<Vendor> findByTenantIdAndDeletedAtIsNull(UUID tenantId);

    boolean existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(UUID tenantId, String name);
}
