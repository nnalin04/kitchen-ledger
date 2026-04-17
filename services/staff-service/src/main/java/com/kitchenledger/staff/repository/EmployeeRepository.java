package com.kitchenledger.staff.repository;

import com.kitchenledger.staff.model.Employee;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EmployeeRepository extends JpaRepository<Employee, UUID> {

    Optional<Employee> findByIdAndTenantIdAndDeletedAtIsNull(UUID id, UUID tenantId);

    List<Employee> findByTenantIdAndDeletedAtIsNullOrderByLastNameAsc(UUID tenantId);

    List<Employee> findByTenantIdAndActiveTrueAndDeletedAtIsNull(UUID tenantId);

    Optional<Employee> findByTenantIdAndUserIdAndDeletedAtIsNull(UUID tenantId, UUID userId);

    boolean existsByTenantIdAndUserIdAndDeletedAtIsNull(UUID tenantId, UUID userId);
}
