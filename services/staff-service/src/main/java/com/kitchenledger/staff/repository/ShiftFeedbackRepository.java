package com.kitchenledger.staff.repository;

import com.kitchenledger.staff.model.ShiftFeedback;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ShiftFeedbackRepository extends JpaRepository<ShiftFeedback, UUID> {

    Optional<ShiftFeedback> findByShiftIdAndEmployeeId(UUID shiftId, UUID employeeId);

    List<ShiftFeedback> findByTenantIdAndSubmittedAtBetween(UUID tenantId, Instant from, Instant to);

    @Query("SELECT AVG(f.rating) FROM ShiftFeedback f WHERE f.tenantId = :tenantId AND f.submittedAt BETWEEN :from AND :to")
    Double avgRatingBetween(@Param("tenantId") UUID tenantId,
                            @Param("from") Instant from,
                            @Param("to") Instant to);
}
