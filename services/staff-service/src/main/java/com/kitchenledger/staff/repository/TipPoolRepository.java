package com.kitchenledger.staff.repository;

import com.kitchenledger.staff.model.TipPool;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

public interface TipPoolRepository extends JpaRepository<TipPool, UUID> {

    Optional<TipPool> findByTenantIdAndPoolDate(UUID tenantId, LocalDate date);

    Optional<TipPool> findByIdAndTenantId(UUID id, UUID tenantId);

    Page<TipPool> findByTenantIdOrderByPoolDateDesc(UUID tenantId, Pageable pageable);
}
