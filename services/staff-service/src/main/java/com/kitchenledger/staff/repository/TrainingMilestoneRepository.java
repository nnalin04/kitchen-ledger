package com.kitchenledger.staff.repository;

import com.kitchenledger.staff.model.TrainingMilestone;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface TrainingMilestoneRepository extends JpaRepository<TrainingMilestone, UUID> {

    Page<TrainingMilestone> findByTenantIdOrderByCreatedAtDesc(UUID tenantId, Pageable pageable);

    Page<TrainingMilestone> findByTenantIdAndEmployeeIdOrderByCreatedAtDesc(
            UUID tenantId, UUID employeeId, Pageable pageable);

    Optional<TrainingMilestone> findByIdAndTenantId(UUID id, UUID tenantId);
}
