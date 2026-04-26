package com.kitchenledger.staff.repository;

import com.kitchenledger.staff.model.PerformanceGoal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PerformanceGoalRepository extends JpaRepository<PerformanceGoal, UUID> {

    List<PerformanceGoal> findByTenantIdAndEmployeeIdAndDeletedAtIsNull(UUID tenantId, UUID employeeId);

    Optional<PerformanceGoal> findByIdAndTenantIdAndDeletedAtIsNull(UUID id, UUID tenantId);

    /** For markExpiredGoals job: finds active goals whose period has already ended. */
    @Query("SELECT g FROM PerformanceGoal g WHERE g.status = 'active' AND g.periodEnd < :today AND g.deletedAt IS NULL")
    List<PerformanceGoal> findActiveExpired(@Param("today") LocalDate today);
}
