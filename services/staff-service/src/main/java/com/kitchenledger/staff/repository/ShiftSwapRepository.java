package com.kitchenledger.staff.repository;

import com.kitchenledger.staff.model.ShiftSwap;
import com.kitchenledger.staff.model.enums.ShiftSwapStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ShiftSwapRepository extends JpaRepository<ShiftSwap, UUID> {

    Page<ShiftSwap> findByTenantIdOrderByCreatedAtDesc(UUID tenantId, Pageable pageable);

    Page<ShiftSwap> findByTenantIdAndStatusOrderByCreatedAtDesc(
            UUID tenantId, ShiftSwapStatus status, Pageable pageable);

    Optional<ShiftSwap> findByIdAndTenantId(UUID id, UUID tenantId);
}
