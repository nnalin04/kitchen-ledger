package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.CreatePerformanceGoalRequest;
import com.kitchenledger.staff.exception.ResourceNotFoundException;
import com.kitchenledger.staff.exception.ValidationException;
import com.kitchenledger.staff.model.Employee;
import com.kitchenledger.staff.model.PerformanceGoal;
import com.kitchenledger.staff.repository.EmployeeRepository;
import com.kitchenledger.staff.repository.PerformanceGoalRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PerformanceGoalServiceTest {

    @Mock private PerformanceGoalRepository goalRepository;
    @Mock private EmployeeRepository employeeRepository;

    @InjectMocks private PerformanceGoalService goalService;

    private UUID tenantId;
    private UUID employeeId;
    private UUID createdBy;

    @BeforeEach
    void setUp() {
        tenantId   = UUID.randomUUID();
        employeeId = UUID.randomUUID();
        createdBy  = UUID.randomUUID();
    }

    // ── createGoal ────────────────────────────────────────────────────────────

    @Test
    void createGoal_validPeriod_savedWithStatusActive() {
        CreatePerformanceGoalRequest req = buildRequest(
                "orders_per_hour", new BigDecimal("50"),
                LocalDate.now(), LocalDate.now().plusMonths(1));

        Employee emp = employee();
        when(employeeRepository.findByIdAndTenantIdAndDeletedAtIsNull(employeeId, tenantId))
                .thenReturn(Optional.of(emp));

        PerformanceGoal saved = goalFrom(req, "active");
        when(goalRepository.save(any(PerformanceGoal.class))).thenReturn(saved);

        PerformanceGoal result = goalService.createGoal(tenantId, employeeId, createdBy, req);

        assertThat(result.getStatus()).isEqualTo("active");
        assertThat(result.getCurrentValue()).isEqualByComparingTo(BigDecimal.ZERO);
        verify(goalRepository).save(any(PerformanceGoal.class));
    }

    @Test
    void createGoal_periodEndNotAfterStart_throwsValidationException() {
        CreatePerformanceGoalRequest req = buildRequest(
                "orders_per_hour", new BigDecimal("50"),
                LocalDate.now(), LocalDate.now()); // same day — invalid

        when(employeeRepository.findByIdAndTenantIdAndDeletedAtIsNull(employeeId, tenantId))
                .thenReturn(Optional.of(employee()));

        assertThatThrownBy(() -> goalService.createGoal(tenantId, employeeId, createdBy, req))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("period_end must be after period_start");
        verify(goalRepository, never()).save(any());
    }

    @Test
    void createGoal_employeeNotFound_throwsResourceNotFoundException() {
        CreatePerformanceGoalRequest req = buildRequest(
                "sales", new BigDecimal("1000"),
                LocalDate.now(), LocalDate.now().plusMonths(1));

        when(employeeRepository.findByIdAndTenantIdAndDeletedAtIsNull(employeeId, tenantId))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> goalService.createGoal(tenantId, employeeId, createdBy, req))
                .isInstanceOf(ResourceNotFoundException.class);
        verify(goalRepository, never()).save(any());
    }

    // ── updateProgress ────────────────────────────────────────────────────────

    @Test
    void updateProgress_reachesTargetWithinPeriod_statusBecomesAchieved() {
        UUID goalId = UUID.randomUUID();
        PerformanceGoal goal = activeGoal(goalId, new BigDecimal("50"), BigDecimal.ZERO,
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(10));

        when(goalRepository.findByIdAndTenantIdAndDeletedAtIsNull(goalId, tenantId))
                .thenReturn(Optional.of(goal));
        when(goalRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PerformanceGoal result = goalService.updateProgress(tenantId, goalId, new BigDecimal("50"));

        assertThat(result.getStatus()).isEqualTo("achieved");
        assertThat(result.getCurrentValue()).isEqualByComparingTo("50");
    }

    @Test
    void updateProgress_exceedsTargetWithinPeriod_statusBecomesAchieved() {
        UUID goalId = UUID.randomUUID();
        PerformanceGoal goal = activeGoal(goalId, new BigDecimal("50"), BigDecimal.ZERO,
                LocalDate.now().minusDays(1), LocalDate.now().plusDays(10));

        when(goalRepository.findByIdAndTenantIdAndDeletedAtIsNull(goalId, tenantId))
                .thenReturn(Optional.of(goal));
        when(goalRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PerformanceGoal result = goalService.updateProgress(tenantId, goalId, new BigDecimal("75"));

        assertThat(result.getStatus()).isEqualTo("achieved");
    }

    @Test
    void updateProgress_reachesTargetButPeriodAlreadyEnded_statusNotAutoAchieved() {
        UUID goalId = UUID.randomUUID();
        // Period ended yesterday
        PerformanceGoal goal = activeGoal(goalId, new BigDecimal("50"), BigDecimal.ZERO,
                LocalDate.now().minusDays(30), LocalDate.now().minusDays(1));

        when(goalRepository.findByIdAndTenantIdAndDeletedAtIsNull(goalId, tenantId))
                .thenReturn(Optional.of(goal));
        when(goalRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PerformanceGoal result = goalService.updateProgress(tenantId, goalId, new BigDecimal("50"));

        // Period already ended — should stay active (markExpiredGoals job will handle it)
        assertThat(result.getStatus()).isEqualTo("active");
    }

    @Test
    void updateProgress_belowTarget_statusRemainsActive() {
        UUID goalId = UUID.randomUUID();
        PerformanceGoal goal = activeGoal(goalId, new BigDecimal("100"), BigDecimal.ZERO,
                LocalDate.now(), LocalDate.now().plusMonths(1));

        when(goalRepository.findByIdAndTenantIdAndDeletedAtIsNull(goalId, tenantId))
                .thenReturn(Optional.of(goal));
        when(goalRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        PerformanceGoal result = goalService.updateProgress(tenantId, goalId, new BigDecimal("49"));

        assertThat(result.getStatus()).isEqualTo("active");
    }

    // ── markExpiredGoals ──────────────────────────────────────────────────────

    @Test
    void markExpiredGoals_activePastPeriodGoals_markedAsMissed() {
        UUID goalId1 = UUID.randomUUID();
        UUID goalId2 = UUID.randomUUID();
        PerformanceGoal g1 = activeGoal(goalId1, new BigDecimal("100"), BigDecimal.ZERO,
                LocalDate.now().minusMonths(2), LocalDate.now().minusDays(1));
        PerformanceGoal g2 = activeGoal(goalId2, new BigDecimal("200"), BigDecimal.ZERO,
                LocalDate.now().minusMonths(1), LocalDate.now().minusDays(1));

        when(goalRepository.findActiveExpired(any(LocalDate.class)))
                .thenReturn(List.of(g1, g2));
        when(goalRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        int count = goalService.markExpiredGoals();

        assertThat(count).isEqualTo(2);
        assertThat(g1.getStatus()).isEqualTo("missed");
        assertThat(g2.getStatus()).isEqualTo("missed");
        verify(goalRepository, times(2)).save(any(PerformanceGoal.class));
    }

    @Test
    void markExpiredGoals_noExpiredGoals_returnsZero() {
        when(goalRepository.findActiveExpired(any(LocalDate.class))).thenReturn(List.of());

        int count = goalService.markExpiredGoals();

        assertThat(count).isZero();
        verify(goalRepository, never()).save(any());
    }

    @Test
    void markExpiredGoals_activeCurrentGoal_notMarkedMissed() {
        // Active goal whose period has NOT ended — should not appear in findActiveExpired
        when(goalRepository.findActiveExpired(any(LocalDate.class))).thenReturn(List.of());

        int count = goalService.markExpiredGoals();

        assertThat(count).isZero();
    }

    // ── softDelete ────────────────────────────────────────────────────────────

    @Test
    void softDelete_setsDeletedAt() {
        UUID goalId = UUID.randomUUID();
        PerformanceGoal goal = activeGoal(goalId, new BigDecimal("50"), BigDecimal.ZERO,
                LocalDate.now(), LocalDate.now().plusMonths(1));

        when(goalRepository.findByIdAndTenantIdAndDeletedAtIsNull(goalId, tenantId))
                .thenReturn(Optional.of(goal));
        when(goalRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        goalService.softDelete(tenantId, goalId);

        assertThat(goal.getDeletedAt()).isNotNull();
        verify(goalRepository).save(goal);
        verify(goalRepository, never()).delete(any());
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private CreatePerformanceGoalRequest buildRequest(String metric, BigDecimal target,
                                                       LocalDate start, LocalDate end) {
        CreatePerformanceGoalRequest req = new CreatePerformanceGoalRequest();
        req.setMetric(metric);
        req.setTargetValue(target);
        req.setPeriodStart(start);
        req.setPeriodEnd(end);
        return req;
    }

    private PerformanceGoal activeGoal(UUID id, BigDecimal target, BigDecimal current,
                                        LocalDate start, LocalDate end) {
        return PerformanceGoal.builder()
                .id(id)
                .tenantId(tenantId)
                .employeeId(employeeId)
                .metric("orders_per_hour")
                .targetValue(target)
                .currentValue(current)
                .periodStart(start)
                .periodEnd(end)
                .status("active")
                .build();
    }

    private PerformanceGoal goalFrom(CreatePerformanceGoalRequest req, String status) {
        return PerformanceGoal.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .employeeId(employeeId)
                .metric(req.getMetric())
                .targetValue(req.getTargetValue())
                .currentValue(BigDecimal.ZERO)
                .periodStart(req.getPeriodStart())
                .periodEnd(req.getPeriodEnd())
                .status(status)
                .build();
    }

    private Employee employee() {
        return Employee.builder()
                .id(employeeId)
                .tenantId(tenantId)
                .firstName("Jane")
                .lastName("Doe")
                .build();
    }
}
