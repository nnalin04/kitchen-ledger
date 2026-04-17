package com.kitchenledger.staff.repository;

import com.kitchenledger.staff.model.Shift;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ShiftRepository extends JpaRepository<Shift, UUID> {

    Optional<Shift> findByIdAndTenantId(UUID id, UUID tenantId);

    List<Shift> findByTenantIdAndShiftDateOrderByStartTimeAsc(UUID tenantId, LocalDate date);

    List<Shift> findByTenantIdAndShiftDateBetweenOrderByShiftDateAscStartTimeAsc(
            UUID tenantId, LocalDate from, LocalDate to);

    List<Shift> findByTenantIdAndEmployeeIdAndShiftDateBetween(
            UUID tenantId, UUID employeeId, LocalDate from, LocalDate to);
}
