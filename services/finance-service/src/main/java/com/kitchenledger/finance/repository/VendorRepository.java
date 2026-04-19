package com.kitchenledger.finance.repository;

import com.kitchenledger.finance.model.Vendor;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface VendorRepository extends JpaRepository<Vendor, UUID> {

    Optional<Vendor> findByIdAndTenantIdAndDeletedAtIsNull(UUID id, UUID tenantId);

    List<Vendor> findByTenantIdAndDeletedAtIsNull(UUID tenantId);

    Page<Vendor> findByTenantIdAndDeletedAtIsNull(UUID tenantId, Pageable pageable);

    boolean existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(UUID tenantId, String name);
}
