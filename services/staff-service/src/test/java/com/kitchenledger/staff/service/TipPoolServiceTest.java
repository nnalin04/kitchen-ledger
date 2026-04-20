package com.kitchenledger.staff.service;

import com.kitchenledger.staff.exception.ConflictException;
import com.kitchenledger.staff.exception.ValidationException;
import com.kitchenledger.staff.event.StaffEventPublisher;
import com.kitchenledger.staff.model.Employee;
import com.kitchenledger.staff.model.TipPool;
import com.kitchenledger.staff.model.TipPoolDistribution;
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
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TipPoolServiceTest {

    @Mock private TipPoolRepository tipPoolRepository;
    @Mock private TipPoolDistributionRepository distributionRepository;
    @Mock private EmployeeRepository employeeRepository;
    @Mock private StaffEventPublisher eventPublisher;

    @InjectMocks private TipPoolService tipPoolService;

    private final UUID TENANT = UUID.randomUUID();
    private final UUID CREATOR = UUID.randomUUID();

    // ── Equal-split distribution ───────────────────────────────────────────────

    @Test
    void distribute_equalSplit_writesOneRowPerEmployee() {
        TipPool pool = undistributedPool("300.00", "equal");
        when(tipPoolRepository.findByIdAndTenantId(pool.getId(), TENANT)).thenReturn(Optional.of(pool));
        when(employeeRepository.findByTenantIdAndActiveTrueAndDeletedAtIsNull(TENANT))
                .thenReturn(List.of(employee(), employee(), employee()));
        when(distributionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(tipPoolRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        tipPoolService.distribute(TENANT, pool.getId());

        ArgumentCaptor<TipPoolDistribution> captor = ArgumentCaptor.forClass(TipPoolDistribution.class);
        verify(distributionRepository, times(3)).save(captor.capture());
        captor.getAllValues().forEach(d ->
                assertThat(d.getAmount()).isEqualByComparingTo("100.00"));
    }

    @Test
    void distribute_totalAmountMatchesPoolTotal() {
        TipPool pool = undistributedPool("300.00", "equal");
        when(tipPoolRepository.findByIdAndTenantId(pool.getId(), TENANT)).thenReturn(Optional.of(pool));
        when(employeeRepository.findByTenantIdAndActiveTrueAndDeletedAtIsNull(TENANT))
                .thenReturn(List.of(employee(), employee(), employee()));
        when(distributionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(tipPoolRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        tipPoolService.distribute(TENANT, pool.getId());

        ArgumentCaptor<TipPoolDistribution> captor = ArgumentCaptor.forClass(TipPoolDistribution.class);
        verify(distributionRepository, atLeastOnce()).save(captor.capture());
        BigDecimal total = captor.getAllValues().stream()
                .map(TipPoolDistribution::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        assertThat(total).isEqualByComparingTo("300.00");
    }

    @Test
    void distribute_singleEmployee_getsFullAmount() {
        TipPool pool = undistributedPool("250.00", "equal");
        when(tipPoolRepository.findByIdAndTenantId(pool.getId(), TENANT)).thenReturn(Optional.of(pool));
        when(employeeRepository.findByTenantIdAndActiveTrueAndDeletedAtIsNull(TENANT))
                .thenReturn(List.of(employee()));
        when(distributionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(tipPoolRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        tipPoolService.distribute(TENANT, pool.getId());

        ArgumentCaptor<TipPoolDistribution> captor = ArgumentCaptor.forClass(TipPoolDistribution.class);
        verify(distributionRepository, times(1)).save(captor.capture());
        assertThat(captor.getValue().getAmount()).isEqualByComparingTo("250.00");
    }

    @Test
    void distribute_zeroPool_writesZeroPerEmployee() {
        TipPool pool = undistributedPool("0.00", "equal");
        when(tipPoolRepository.findByIdAndTenantId(pool.getId(), TENANT)).thenReturn(Optional.of(pool));
        when(employeeRepository.findByTenantIdAndActiveTrueAndDeletedAtIsNull(TENANT))
                .thenReturn(List.of(employee(), employee()));
        when(distributionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(tipPoolRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        tipPoolService.distribute(TENANT, pool.getId());

        ArgumentCaptor<TipPoolDistribution> captor = ArgumentCaptor.forClass(TipPoolDistribution.class);
        verify(distributionRepository, times(2)).save(captor.capture());
        captor.getAllValues().forEach(d -> assertThat(d.getAmount()).isEqualByComparingTo("0.00"));
    }

    // ── Guard conditions ──────────────────────────────────────────────────────

    @Test
    void distribute_noEligibleEmployees_throwsValidation() {
        TipPool pool = undistributedPool("100.00", "equal");
        when(tipPoolRepository.findByIdAndTenantId(pool.getId(), TENANT)).thenReturn(Optional.of(pool));
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
        when(tipPoolRepository.findByIdAndTenantId(pool.getId(), TENANT)).thenReturn(Optional.of(pool));

        assertThatThrownBy(() -> tipPoolService.distribute(TENANT, pool.getId()))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("already distributed");
        verify(tipPoolRepository, never()).save(any());
    }

    // ── Event publishing ──────────────────────────────────────────────────────

    @Test
    void distribute_publishesTipDistributedEvent() {
        TipPool pool = undistributedPool("200.00", "equal");
        when(tipPoolRepository.findByIdAndTenantId(pool.getId(), TENANT)).thenReturn(Optional.of(pool));
        when(employeeRepository.findByTenantIdAndActiveTrueAndDeletedAtIsNull(TENANT))
                .thenReturn(List.of(employee()));
        when(distributionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(tipPoolRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

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
                .firstName("Test").lastName("Employee").build();
    }
}
