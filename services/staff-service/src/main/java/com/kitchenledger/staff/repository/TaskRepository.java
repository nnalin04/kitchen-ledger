package com.kitchenledger.staff.repository;

import com.kitchenledger.staff.model.Task;
import com.kitchenledger.staff.model.enums.TaskStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TaskRepository extends JpaRepository<Task, UUID> {

    Optional<Task> findByIdAndTenantIdAndDeletedAtIsNull(UUID id, UUID tenantId);

    Page<Task> findByTenantIdAndDeletedAtIsNullOrderByDueDateAsc(UUID tenantId, Pageable pageable);

    List<Task> findByTenantIdAndAssignedToAndStatusAndDeletedAtIsNull(
            UUID tenantId, UUID assignedTo, TaskStatus status);

    Page<Task> findByTenantIdAndStatusAndDeletedAtIsNullOrderByDueDateAsc(
            UUID tenantId, TaskStatus status, Pageable pageable);
}
