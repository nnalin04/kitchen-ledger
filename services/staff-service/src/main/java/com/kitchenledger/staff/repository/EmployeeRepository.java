package com.kitchenledger.staff.repository;

import com.kitchenledger.staff.model.Employee;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface EmployeeRepository extends JpaRepository<Employee, UUID> {

    Optional<Employee> findByIdAndTenantIdAndDeletedAtIsNull(UUID id, UUID tenantId);

    List<Employee> findByTenantIdAndDeletedAtIsNullOrderByLastNameAsc(UUID tenantId);

    Page<Employee> findByTenantIdAndDeletedAtIsNull(UUID tenantId, Pageable pageable);

    List<Employee> findByTenantIdAndActiveTrueAndDeletedAtIsNull(UUID tenantId);

    Page<Employee> findByTenantIdAndActiveTrueAndDeletedAtIsNull(UUID tenantId, Pageable pageable);

    Optional<Employee> findByTenantIdAndUserIdAndDeletedAtIsNull(UUID tenantId, UUID userId);

    boolean existsByTenantIdAndUserIdAndDeletedAtIsNull(UUID tenantId, UUID userId);
}
