package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.CreateCertificationRequest;
import com.kitchenledger.staff.exception.ResourceNotFoundException;
import com.kitchenledger.staff.model.Certification;
import com.kitchenledger.staff.model.enums.CertificationStatus;
import com.kitchenledger.staff.repository.CertificationRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CertificationServiceTest {

    @Mock private CertificationRepository repository;

    @InjectMocks private CertificationService service;

    private UUID tenantId;
    private UUID employeeId;

    @BeforeEach
    void setUp() {
        tenantId   = UUID.randomUUID();
        employeeId = UUID.randomUUID();
    }

    // ── create ────────────────────────────────────────────────────────────────

    @Test
    void create_persistsAndReturnsCert() {
        CreateCertificationRequest req = buildRequest("Food Handler Card", LocalDate.now().plusYears(1));
        Certification saved = certEntity(req);

        when(repository.save(any(Certification.class))).thenReturn(saved);

        Certification result = service.create(tenantId, req);

        assertThat(result.getCertName()).isEqualTo("Food Handler Card");
        assertThat(result.getStatus()).isEqualTo(CertificationStatus.ACTIVE);
        verify(repository).save(any(Certification.class));
    }

    // ── getById ───────────────────────────────────────────────────────────────

    @Test
    void getById_found_returnsCert() {
        Certification cert = activeCert("ServSafe", LocalDate.now().plusMonths(6));
        when(repository.findByIdAndTenantIdAndDeletedAtIsNull(cert.getId(), tenantId))
                .thenReturn(Optional.of(cert));

        Certification result = service.getById(tenantId, cert.getId());

        assertThat(result.getId()).isEqualTo(cert.getId());
    }

    @Test
    void getById_notFound_throwsResourceNotFoundException() {
        UUID certId = UUID.randomUUID();
        when(repository.findByIdAndTenantIdAndDeletedAtIsNull(certId, tenantId))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getById(tenantId, certId))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    // ── list ──────────────────────────────────────────────────────────────────

    @Test
    void list_allForTenant_delegatesToRepository() {
        when(repository.findByTenantIdAndDeletedAtIsNullOrderByCreatedAtDesc(eq(tenantId), any()))
                .thenReturn(new PageImpl<>(List.of()));

        service.list(tenantId, null, Pageable.unpaged());

        verify(repository).findByTenantIdAndDeletedAtIsNullOrderByCreatedAtDesc(eq(tenantId), any());
    }

    @Test
    void list_byEmployee_delegatesToEmployeeQuery() {
        when(repository.findByTenantIdAndEmployeeIdAndDeletedAtIsNullOrderByCreatedAtDesc(
                eq(tenantId), eq(employeeId), any())).thenReturn(new PageImpl<>(List.of()));

        service.list(tenantId, employeeId, Pageable.unpaged());

        verify(repository).findByTenantIdAndEmployeeIdAndDeletedAtIsNullOrderByCreatedAtDesc(
                eq(tenantId), eq(employeeId), any());
    }

    // ── update ────────────────────────────────────────────────────────────────

    @Test
    void update_changesCertFields() {
        Certification cert = activeCert("Old Name", LocalDate.now().plusYears(1));
        CreateCertificationRequest req = buildRequest("New Name", LocalDate.now().plusYears(2));

        when(repository.findByIdAndTenantIdAndDeletedAtIsNull(cert.getId(), tenantId))
                .thenReturn(Optional.of(cert));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Certification result = service.update(tenantId, cert.getId(), req);

        assertThat(result.getCertName()).isEqualTo("New Name");
        assertThat(result.getExpiryDate()).isEqualTo(LocalDate.now().plusYears(2));
    }

    // ── revoke ────────────────────────────────────────────────────────────────

    @Test
    void revoke_setsStatusRevoked() {
        Certification cert = activeCert("ServSafe", LocalDate.now().plusYears(1));
        when(repository.findByIdAndTenantIdAndDeletedAtIsNull(cert.getId(), tenantId))
                .thenReturn(Optional.of(cert));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.revoke(tenantId, cert.getId());

        assertThat(cert.getStatus()).isEqualTo(CertificationStatus.REVOKED);
    }

    // ── delete (soft) ─────────────────────────────────────────────────────────

    @Test
    void delete_setsDeletedAt_rowNotRemoved() {
        Certification cert = activeCert("ServSafe", LocalDate.now().plusYears(1));
        when(repository.findByIdAndTenantIdAndDeletedAtIsNull(cert.getId(), tenantId))
                .thenReturn(Optional.of(cert));
        when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.delete(tenantId, cert.getId());

        assertThat(cert.getDeletedAt()).isNotNull();
        verify(repository).save(cert);
        verify(repository, never()).delete(any());
    }

    // ── expiry date validation — boundary: already expired ───────────────────

    @Test
    void create_withPastExpiryDate_stillPersists() {
        CreateCertificationRequest req = buildRequest("Expired Cert", LocalDate.now().minusDays(1));
        Certification saved = certEntity(req);
        when(repository.save(any())).thenReturn(saved);

        // Service does not reject past dates — job handles auto-expiry
        assertThatNoException().isThrownBy(() -> service.create(tenantId, req));
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private Certification activeCert(String name, LocalDate expiry) {
        return Certification.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .employeeId(employeeId)
                .certName(name)
                .expiryDate(expiry)
                .status(CertificationStatus.ACTIVE)
                .build();
    }

    private Certification certEntity(CreateCertificationRequest req) {
        return Certification.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .employeeId(req.getEmployeeId())
                .certName(req.getCertName())
                .expiryDate(req.getExpiryDate())
                .status(CertificationStatus.ACTIVE)
                .build();
    }

    private CreateCertificationRequest buildRequest(String name, LocalDate expiry) {
        CreateCertificationRequest req = new CreateCertificationRequest();
        req.setEmployeeId(employeeId);
        req.setCertName(name);
        req.setExpiryDate(expiry);
        return req;
    }
}
