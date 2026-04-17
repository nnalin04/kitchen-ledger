package com.kitchenledger.staff.repository;

import com.kitchenledger.staff.model.Attendance;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AttendanceRepository extends JpaRepository<Attendance, UUID> {

    Page<Attendance> findByTenantIdOrderByClockInAtDesc(UUID tenantId, Pageable pageable);

    List<Attendance> findByTenantIdAndEmployeeIdOrderByClockInAtDesc(UUID tenantId, UUID employeeId);

    List<Attendance> findByTenantIdAndClockInAtBetweenOrderByClockInAtDesc(
            UUID tenantId, Instant from, Instant to);

    /** Find open clock-in (no clock-out yet) for an employee. */
    Optional<Attendance> findByTenantIdAndEmployeeIdAndClockOutAtIsNull(UUID tenantId, UUID employeeId);

    /** Used by no-show detection job: check if any attendance record is linked to a specific shift. */
    boolean existsByShiftIdAndTenantId(UUID shiftId, UUID tenantId);

    @Query("""
        SELECT COALESCE(SUM(a.hoursWorked), 0)
        FROM Attendance a
        WHERE a.tenantId = :tenantId
          AND a.employeeId = :employeeId
          AND a.clockInAt >= :from AND a.clockInAt < :to
          AND a.hoursWorked IS NOT NULL
        """)
    BigDecimal sumHoursWorked(
            @Param("tenantId") UUID tenantId,
            @Param("employeeId") UUID employeeId,
            @Param("from") Instant from,
            @Param("to") Instant to);
}
