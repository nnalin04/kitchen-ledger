package com.kitchenledger.staff.job;

import com.kitchenledger.staff.event.StaffEventPublisher;
import com.kitchenledger.staff.model.Certification;
import com.kitchenledger.staff.model.Employee;
import com.kitchenledger.staff.model.enums.CertificationStatus;
import com.kitchenledger.staff.repository.CertificationRepository;
import com.kitchenledger.staff.repository.EmployeeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CertificationExpiryJobTest {

    @Mock private CertificationRepository certificationRepository;
    @Mock private EmployeeRepository      employeeRepository;
    @Mock private StaffEventPublisher     eventPublisher;

    @InjectMocks private CertificationExpiryJob job;

    private UUID tenantId;
    private UUID employeeId;

    @BeforeEach
    void setUp() {
        tenantId   = UUID.randomUUID();
        employeeId = UUID.randomUUID();
    }

    // ── Cert expiring within 30 days → event fired ───────────────────────────

    @Test
    void checkExpiry_certExpiringSoon_publishesEvent() {
        LocalDate expiresIn7Days = LocalDate.now().plusDays(7);
        Certification cert = activeCert(expiresIn7Days);

        when(certificationRepository.findByStatusAndExpiryDateBeforeAndDeletedAtIsNull(
                eq(CertificationStatus.ACTIVE), any()))
                .thenReturn(List.of(cert));
        when(employeeRepository.findByIdAndTenantIdAndDeletedAtIsNull(employeeId, tenantId))
                .thenReturn(Optional.of(employee("Alice", "Smith")));

        job.checkCertificationExpiry();

        verify(eventPublisher).publishCertificationExpiring(
                eq(tenantId), eq(employeeId), eq("Alice Smith"),
                eq(cert.getCertName()), eq(expiresIn7Days.toString()));
        assertThat(cert.getStatus()).isEqualTo(CertificationStatus.ACTIVE);
    }

    // ── Cert already past expiry → auto-marked EXPIRED, no event ─────────────

    @Test
    void checkExpiry_certAlreadyExpired_autoMarksExpiredNoEvent() {
        LocalDate yesterday = LocalDate.now().minusDays(1);
        Certification cert = activeCert(yesterday);

        when(certificationRepository.findByStatusAndExpiryDateBeforeAndDeletedAtIsNull(
                eq(CertificationStatus.ACTIVE), any()))
                .thenReturn(List.of(cert));
        when(certificationRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        job.checkCertificationExpiry();

        assertThat(cert.getStatus()).isEqualTo(CertificationStatus.EXPIRED);
        verify(certificationRepository).save(cert);
        verify(eventPublisher, never()).publishCertificationExpiring(any(), any(), any(), any(), any());
    }

    // ── Cert expiring today → auto-marked EXPIRED (today.isBefore(today) = false) ─

    @Test
    void checkExpiry_certExpiringToday_publishesExpiryEvent() {
        // today is NOT before today, so the auto-expire branch is skipped
        // The cert is in the alert window (today < threshold) and not yet expired
        LocalDate today = LocalDate.now();
        Certification cert = activeCert(today);

        when(certificationRepository.findByStatusAndExpiryDateBeforeAndDeletedAtIsNull(
                eq(CertificationStatus.ACTIVE), any()))
                .thenReturn(List.of(cert));
        when(employeeRepository.findByIdAndTenantIdAndDeletedAtIsNull(employeeId, tenantId))
                .thenReturn(Optional.of(employee("Bob", "Jones")));

        job.checkCertificationExpiry();

        // today.isBefore(today) == false → NOT auto-expired → expiry event fired
        assertThat(cert.getStatus()).isEqualTo(CertificationStatus.ACTIVE);
        verify(eventPublisher).publishCertificationExpiring(any(), any(), anyString(), anyString(), anyString());
    }

    // ── No expiring certs → no-op ─────────────────────────────────────────────

    @Test
    void checkExpiry_noExpiringSoon_noSideEffects() {
        when(certificationRepository.findByStatusAndExpiryDateBeforeAndDeletedAtIsNull(
                eq(CertificationStatus.ACTIVE), any()))
                .thenReturn(List.of());

        job.checkCertificationExpiry();

        verify(certificationRepository, never()).save(any());
        verifyNoInteractions(eventPublisher, employeeRepository);
    }

    // ── Cert with null expiryDate → skipped safely ────────────────────────────

    @Test
    void checkExpiry_nullExpiryDate_skippedSafely() {
        Certification cert = Certification.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .employeeId(employeeId)
                .certName("No Expiry Cert")
                .expiryDate(null)
                .status(CertificationStatus.ACTIVE)
                .build();

        when(certificationRepository.findByStatusAndExpiryDateBeforeAndDeletedAtIsNull(
                eq(CertificationStatus.ACTIVE), any()))
                .thenReturn(List.of(cert));

        job.checkCertificationExpiry();

        verify(certificationRepository, never()).save(any());
        verifyNoInteractions(eventPublisher);
    }

    // ── Per-tenant isolation ──────────────────────────────────────────────────

    @Test
    void shouldContinueProcessingRemainingBatchesWhenOneFails() {
        LocalDate expiresIn7Days = LocalDate.now().plusDays(7);

        // Three distinct tenants / employees so stubs are unambiguous
        UUID tenant1   = UUID.randomUUID();
        UUID employee1 = UUID.randomUUID();
        UUID tenant2   = UUID.randomUUID();
        UUID employee2 = UUID.randomUUID();
        UUID tenant3   = UUID.randomUUID();
        UUID employee3 = UUID.randomUUID();

        Certification cert1 = Certification.builder()
                .id(UUID.randomUUID()).tenantId(tenant1).employeeId(employee1)
                .certName("Food Handler Card").expiryDate(expiresIn7Days)
                .status(CertificationStatus.ACTIVE).build();
        Certification cert2 = Certification.builder()
                .id(UUID.randomUUID()).tenantId(tenant2).employeeId(employee2)
                .certName("Allergy Awareness").expiryDate(expiresIn7Days)
                .status(CertificationStatus.ACTIVE).build();
        Certification cert3 = Certification.builder()
                .id(UUID.randomUUID()).tenantId(tenant3).employeeId(employee3)
                .certName("Fire Safety").expiryDate(expiresIn7Days)
                .status(CertificationStatus.ACTIVE).build();

        when(certificationRepository.findByStatusAndExpiryDateBeforeAndDeletedAtIsNull(
                eq(CertificationStatus.ACTIVE), any()))
                .thenReturn(List.of(cert1, cert2, cert3));
        when(employeeRepository.findByIdAndTenantIdAndDeletedAtIsNull(employee1, tenant1))
                .thenReturn(Optional.of(employee("Alice", "Smith")));
        when(employeeRepository.findByIdAndTenantIdAndDeletedAtIsNull(employee2, tenant2))
                .thenThrow(new RuntimeException("simulated failure"));
        when(employeeRepository.findByIdAndTenantIdAndDeletedAtIsNull(employee3, tenant3))
                .thenReturn(Optional.of(employee("Bob", "Jones")));

        // Must not throw — job isolates per-cert failures
        job.checkCertificationExpiry();

        // cert1 and cert3 processed despite cert2 failing
        verify(employeeRepository).findByIdAndTenantIdAndDeletedAtIsNull(employee1, tenant1);
        verify(employeeRepository).findByIdAndTenantIdAndDeletedAtIsNull(employee2, tenant2);
        verify(employeeRepository).findByIdAndTenantIdAndDeletedAtIsNull(employee3, tenant3);
        verify(eventPublisher, times(2)).publishCertificationExpiring(
                any(), any(), anyString(), anyString(), anyString());
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private Certification activeCert(LocalDate expiry) {
        return Certification.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .employeeId(employeeId)
                .certName("Food Handler Card")
                .expiryDate(expiry)
                .status(CertificationStatus.ACTIVE)
                .build();
    }

    private Employee employee(String first, String last) {
        return Employee.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .userId(UUID.randomUUID())
                .firstName(first)
                .lastName(last)
                .role("kitchen_staff")
                .build();
    }
}
