package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.CreatePerformanceGoalRequest;
import com.kitchenledger.staff.exception.ResourceNotFoundException;
import com.kitchenledger.staff.exception.ValidationException;
import com.kitchenledger.staff.model.PerformanceGoal;
import com.kitchenledger.staff.repository.EmployeeRepository;
import com.kitchenledger.staff.repository.PerformanceGoalRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class PerformanceGoalService {

    private final PerformanceGoalRepository goalRepository;
    private final EmployeeRepository employeeRepository;

    @Transactional
    public PerformanceGoal createGoal(UUID tenantId, UUID employeeId, UUID createdBy,
                                      CreatePerformanceGoalRequest req) {
        // Validate employee belongs to tenant
        employeeRepository.findByIdAndTenantIdAndDeletedAtIsNull(employeeId, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Employee not found: " + employeeId));

        // Validate period_end > period_start
        if (!req.getPeriodEnd().isAfter(req.getPeriodStart())) {
            throw new ValidationException("period_end must be after period_start");
        }

        PerformanceGoal goal = PerformanceGoal.builder()
                .tenantId(tenantId)
                .employeeId(employeeId)
                .metric(req.getMetric())
                .targetValue(req.getTargetValue())
                .currentValue(BigDecimal.ZERO)
                .periodStart(req.getPeriodStart())
                .periodEnd(req.getPeriodEnd())
                .status("active")
                .build();
        return goalRepository.save(goal);
    }

    @Transactional
    public PerformanceGoal updateProgress(UUID tenantId, UUID goalId, BigDecimal currentValue) {
        PerformanceGoal goal = goalRepository.findByIdAndTenantIdAndDeletedAtIsNull(goalId, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Goal not found: " + goalId));

        goal.setCurrentValue(currentValue);

        // Auto-achieve if reached target within the period
        if (currentValue.compareTo(goal.getTargetValue()) >= 0
                && "active".equals(goal.getStatus())
                && !LocalDate.now().isAfter(goal.getPeriodEnd())) {
            goal.setStatus("achieved");
        }
        return goalRepository.save(goal);
    }

    @Transactional(readOnly = true)
    public List<PerformanceGoal> listByEmployee(UUID tenantId, UUID employeeId) {
        return goalRepository.findByTenantIdAndEmployeeIdAndDeletedAtIsNull(tenantId, employeeId);
    }

    @Transactional
    public void softDelete(UUID tenantId, UUID goalId) {
        PerformanceGoal goal = goalRepository.findByIdAndTenantIdAndDeletedAtIsNull(goalId, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Goal not found: " + goalId));
        goal.setDeletedAt(Instant.now());
        goalRepository.save(goal);
    }

    /** Called by scheduled job — marks all active goals whose period has ended as MISSED. */
    @Transactional
    public int markExpiredGoals() {
        List<PerformanceGoal> expired = goalRepository.findActiveExpired(LocalDate.now());
        int count = 0;
        for (PerformanceGoal goal : expired) {
            goal.setStatus("missed");
            goalRepository.save(goal);
            count++;
        }
        if (count > 0) {
            log.info("PerformanceGoalService.markExpiredGoals: marked {} goals as MISSED", count);
        }
        return count;
    }
}
