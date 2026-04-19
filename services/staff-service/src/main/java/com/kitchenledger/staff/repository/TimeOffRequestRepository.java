package com.kitchenledger.staff.repository;

import com.kitchenledger.staff.model.TimeOffRequest;
import com.kitchenledger.staff.model.enums.TimeOffStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface TimeOffRequestRepository extends JpaRepository<TimeOffRequest, UUID> {

    Page<TimeOffRequest> findByTenantIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID tenantId, Pageable pageable);

    Page<TimeOffRequest> findByTenantIdAndEmployeeIdAndDeletedAtIsNullOrderByCreatedAtDesc(
            UUID tenantId, UUID employeeId, Pageable pageable);

    Page<TimeOffRequest> findByTenantIdAndStatusAndDeletedAtIsNullOrderByCreatedAtDesc(
            UUID tenantId, TimeOffStatus status, Pageable pageable);

    Optional<TimeOffRequest> findByIdAndTenantIdAndDeletedAtIsNull(UUID id, UUID tenantId);
}
