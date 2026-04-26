package com.kitchenledger.staff.service;

import com.kitchenledger.staff.exception.ConflictException;
import com.kitchenledger.staff.exception.ValidationException;
import com.kitchenledger.staff.event.StaffEventPublisher;
import com.kitchenledger.staff.model.Attendance;
import com.kitchenledger.staff.model.Employee;
import com.kitchenledger.staff.model.TipPool;
import com.kitchenledger.staff.model.TipPoolDistribution;
import com.kitchenledger.staff.repository.AttendanceRepository;
import com.kitchenledger.staff.repository.EmployeeRepository;
import com.kitchenledger.staff.repository.TipPoolDistributionRepository;
import com.kitchenledger.staff.repository.TipPoolRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TipPoolServiceTest {

    @Mock private TipPoolRepository tipPoolRepository;
    @Mock private TipPoolDistributionRepository distributionRepository;
    @Mock private EmployeeRepository employeeRepository;
    @Mock private AttendanceRepository attendanceRepository;
    @Mock private StaffEventPublisher eventPublisher;

    @InjectMocks private TipPoolService tipPoolService;

    private final UUID TENANT  = UUID.randomUUID();
    private final UUID CREATOR = UUID.randomUUID();

    // ── Equal-split distribution ───────────────────────────────────────────────

    @Test
    void distribute_equalSplit_writesOneRowPerEmployee() {
        TipPool pool = undistributedPool("300.00", "equal");
        stubPool(pool);
        stubEmployees(employee(), employee(), employee());
        stubSaveAll();

        tipPoolService.distribute(TENANT, pool.getId());

        ArgumentCaptor<List<TipPoolDistribution>> captor = listCaptor();
        verify(distributionRepository).saveAll(captor.capture());
        captor.getValue().forEach(d ->
                assertThat(d.getAmount()).isEqualByComparingTo("100.00"));
    }

    @Test
    void distribute_equal_remainderToLastEmployee() {
        // ₹100 / 3 = ₹33.33 each, remainder 0.01 → last gets 33.34
        TipPool pool = undistributedPool("100.00", "equal");
        stubPool(pool);
        stubEmployees(employee(), employee(), employee());
        stubSaveAll();

        tipPoolService.distribute(TENANT, pool.getId());

        ArgumentCaptor<List<TipPoolDistribution>> captor = listCaptor();
        verify(distributionRepository).saveAll(captor.capture());
        List<BigDecimal> amounts = amounts(captor);

        assertThat(amounts).hasSize(3);
        // First two should be 33.33
        assertThat(amounts.get(0)).isEqualByComparingTo("33.33");
        assertThat(amounts.get(1)).isEqualByComparingTo("33.33");
        // Last absorbs remainder → 33.34
        assertThat(amounts.get(2)).isEqualByComparingTo("33.34");
        // Sum must equal pool total
        BigDecimal total = amounts.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(total).isEqualByComparingTo("100.00");
    }

    @Test
    void distribute_totalAmountMatchesPoolTotal() {
        TipPool pool = undistributedPool("300.00", "equal");
        stubPool(pool);
        stubEmployees(employee(), employee(), employee());
        stubSaveAll();

        tipPoolService.distribute(TENANT, pool.getId());

        ArgumentCaptor<List<TipPoolDistribution>> captor = listCaptor();
        verify(distributionRepository).saveAll(captor.capture());
        BigDecimal total = amounts(captor).stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(total).isEqualByComparingTo("300.00");
    }

    @Test
    void distribute_singleEmployee_getsFullAmount() {
        TipPool pool = undistributedPool("250.00", "equal");
        stubPool(pool);
        stubEmployees(employee());
        stubSaveAll();

        tipPoolService.distribute(TENANT, pool.getId());

        ArgumentCaptor<List<TipPoolDistribution>> captor = listCaptor();
        verify(distributionRepository).saveAll(captor.capture());
        assertThat(captor.getValue()).hasSize(1);
        assertThat(captor.getValue().get(0).getAmount()).isEqualByComparingTo("250.00");
    }

    @Test
    void distribute_zeroPool_writesZeroPerEmployee() {
        TipPool pool = undistributedPool("0.00", "equal");
        stubPool(pool);
        stubEmployees(employee(), employee());
        stubSaveAll();

        tipPoolService.distribute(TENANT, pool.getId());

        ArgumentCaptor<List<TipPoolDistribution>> captor = listCaptor();
        verify(distributionRepository).saveAll(captor.capture());
        captor.getValue().forEach(d -> assertThat(d.getAmount()).isEqualByComparingTo("0.00"));
    }

    // ── BY_HOURS distribution ─────────────────────────────────────────────────

    @Test
    void distribute_byHours_proportionalPayouts() {
        // 3 employees: 4h + 3h + 2h = 9h total, ₹900 pool
        // Expected: ₹400 / ₹300 / ₹200 (last absorbs remainder)
        UUID e1 = UUID.randomUUID(), e2 = UUID.randomUUID(), e3 = UUID.randomUUID();
        TipPool pool = undistributedPool("900.00", "BY_HOURS");
        stubPool(pool);
        stubEmployees(
                employeeWithId(e1),
                employeeWithId(e2),
                employeeWithId(e3));

        when(attendanceRepository.findByTenantIdAndDate(eq(TENANT), any(), any()))
                .thenReturn(List.of(
                        attendance(e1, "4.00"),
                        attendance(e2, "3.00"),
                        attendance(e3, "2.00")));
        stubSaveAll();

        tipPoolService.distribute(TENANT, pool.getId());

        ArgumentCaptor<List<TipPoolDistribution>> captor = listCaptor();
        verify(distributionRepository).saveAll(captor.capture());
        List<TipPoolDistribution> payouts = captor.getValue();
        assertThat(payouts).hasSize(3);

        // Find amounts by employeeId
        BigDecimal amt1 = payouts.stream().filter(d -> d.getEmployeeId().equals(e1))
                .findFirst().orElseThrow().getAmount();
        BigDecimal amt2 = payouts.stream().filter(d -> d.getEmployeeId().equals(e2))
                .findFirst().orElseThrow().getAmount();
        BigDecimal amt3 = payouts.stream().filter(d -> d.getEmployeeId().equals(e3))
                .findFirst().orElseThrow().getAmount();

        assertThat(amt1).isEqualByComparingTo("400.00");
        assertThat(amt2).isEqualByComparingTo("300.00");
        assertThat(amt3).isEqualByComparingTo("200.00");

        BigDecimal total = payouts.stream().map(TipPoolDistribution::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(total).isEqualByComparingTo("900.00");
    }

    @Test
    void distribute_byHours_noAttendanceRecords_fallsBackToEqual() {
        // No attendance → equal split
        TipPool pool = undistributedPool("300.00", "BY_HOURS");
        stubPool(pool);
        Employee e1 = employee(), e2 = employee(), e3 = employee();
        stubEmployees(e1, e2, e3);

        when(attendanceRepository.findByTenantIdAndDate(eq(TENANT), any(), any()))
                .thenReturn(List.of());
        stubSaveAll();

        tipPoolService.distribute(TENANT, pool.getId());

        ArgumentCaptor<List<TipPoolDistribution>> captor = listCaptor();
        verify(distributionRepository).saveAll(captor.capture());
        List<BigDecimal> amounts = amounts(captor);
        assertThat(amounts).hasSize(3);
        BigDecimal total = amounts.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(total).isEqualByComparingTo("300.00");
        // All equal
        amounts.forEach(a -> assertThat(a).isEqualByComparingTo("100.00"));
    }

    // ── BY_ROLE distribution ──────────────────────────────────────────────────

    @Test
    void distribute_byRole_twoServersOneBartender() {
        // 2 servers + 1 bartender, ₹100 pool
        // 2 roles → each role gets ₹50
        // servers: 50/2 = ₹25 each; bartender: ₹50
        UUID s1 = UUID.randomUUID(), s2 = UUID.randomUUID(), b1 = UUID.randomUUID();
        TipPool pool = undistributedPool("100.00", "BY_ROLE");
        stubPool(pool);
        stubEmployees(
                employeeWithRole(s1, "server"),
                employeeWithRole(s2, "server"),
                employeeWithRole(b1, "bartender"));

        stubSaveAll();

        tipPoolService.distribute(TENANT, pool.getId());

        ArgumentCaptor<List<TipPoolDistribution>> captor = listCaptor();
        verify(distributionRepository).saveAll(captor.capture());
        List<TipPoolDistribution> payouts = captor.getValue();
        assertThat(payouts).hasSize(3);

        BigDecimal totalPaid = payouts.stream().map(TipPoolDistribution::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(totalPaid).isEqualByComparingTo("100.00");

        BigDecimal bartenderAmt = payouts.stream()
                .filter(d -> d.getEmployeeId().equals(b1))
                .findFirst().orElseThrow().getAmount();
        // Bartender is sole member of role → gets full role share = 50%
        assertThat(bartenderAmt).isEqualByComparingTo("50.00");

        BigDecimal serverTotal = payouts.stream()
                .filter(d -> !d.getEmployeeId().equals(b1))
                .map(TipPoolDistribution::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(serverTotal).isEqualByComparingTo("50.00");

        // Each server individually
        payouts.stream()
                .filter(d -> !d.getEmployeeId().equals(b1))
                .forEach(d -> assertThat(d.getAmount()).isEqualByComparingTo("25.00"));
    }

    // ── Guard conditions ──────────────────────────────────────────────────────

    @Test
    void distribute_noEligibleEmployees_throwsValidation() {
        TipPool pool = undistributedPool("100.00", "equal");
        stubPool(pool);
        when(employeeRepository.findByTenantIdAndActiveTrueAndDeletedAtIsNull(TENANT))
                .thenReturn(List.of());

        assertThatThrownBy(() -> tipPoolService.distribute(TENANT, pool.getId()))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("no eligible employees");
    }

    @Test
    void distribute_alreadyDistributed_throwsConflict() {
        TipPool pool = undistributedPool("100.00", "equal");
        pool.setDistributed(true);
        when(tipPoolRepository.findByIdAndTenantId(pool.getId(), TENANT))
                .thenReturn(Optional.of(pool));

        assertThatThrownBy(() -> tipPoolService.distribute(TENANT, pool.getId()))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("already distributed");
        verify(tipPoolRepository, never()).save(any());
    }

    // ── Event publishing ──────────────────────────────────────────────────────

    @Test
    void distribute_publishesTipDistributedEvent() {
        TipPool pool = undistributedPool("200.00", "equal");
        stubPool(pool);
        stubEmployees(employee());
        stubSaveAll();

        tipPoolService.distribute(TENANT, pool.getId());

        verify(eventPublisher).publishTipDistributed(eq(TENANT), any(), eq(new BigDecimal("200.00")));
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private TipPool undistributedPool(String amount, String method) {
        return TipPool.builder()
                .id(UUID.randomUUID()).tenantId(TENANT).poolDate(LocalDate.now())
                .totalAmount(new BigDecimal(amount)).distributionMethod(method)
                .distributed(false).createdBy(CREATOR).build();
    }

    private Employee employee() {
        return Employee.builder()
                .id(UUID.randomUUID()).tenantId(TENANT)
                .firstName("Test").lastName("Employee").role("server").build();
    }

    private Employee employeeWithId(UUID id) {
        return Employee.builder()
                .id(id).tenantId(TENANT)
                .firstName("Test").lastName("Employee").role("server").build();
    }

    private Employee employeeWithRole(UUID id, String role) {
        return Employee.builder()
                .id(id).tenantId(TENANT)
                .firstName("Test").lastName("Employee").role(role).build();
    }

    private Attendance attendance(UUID employeeId, String hours) {
        return Attendance.builder()
                .id(UUID.randomUUID())
                .tenantId(TENANT)
                .employeeId(employeeId)
                .clockInAt(Instant.now())
                .hoursWorked(new BigDecimal(hours))
                .recordedBy(CREATOR)
                .build();
    }

    private void stubPool(TipPool pool) {
        when(tipPoolRepository.findByIdAndTenantId(pool.getId(), TENANT))
                .thenReturn(Optional.of(pool));
        when(tipPoolRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    private void stubEmployees(Employee... employees) {
        when(employeeRepository.findByTenantIdAndActiveTrueAndDeletedAtIsNull(TENANT))
                .thenReturn(List.of(employees));
    }

    private void stubSaveAll() {
        when(distributionRepository.saveAll(anyList())).thenAnswer(inv -> inv.getArgument(0));
    }

    @SuppressWarnings("unchecked")
    private ArgumentCaptor<List<TipPoolDistribution>> listCaptor() {
        return ArgumentCaptor.forClass((Class<List<TipPoolDistribution>>) (Class<?>) List.class);
    }

    private List<BigDecimal> amounts(ArgumentCaptor<List<TipPoolDistribution>> captor) {
        return captor.getValue().stream()
                .map(TipPoolDistribution::getAmount)
                .collect(Collectors.toList());
    }
}
