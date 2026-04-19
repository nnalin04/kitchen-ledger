package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.CreateCertificationRequest;
import com.kitchenledger.staff.exception.ResourceNotFoundException;
import com.kitchenledger.staff.model.Certification;
import com.kitchenledger.staff.model.enums.CertificationStatus;
import com.kitchenledger.staff.repository.CertificationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class CertificationService {

    private final CertificationRepository repository;

    @Transactional(readOnly = true)
    public Page<Certification> list(UUID tenantId, UUID employeeId, Pageable pageable) {
        if (employeeId != null) {
            return repository.findByTenantIdAndEmployeeIdAndDeletedAtIsNullOrderByCreatedAtDesc(
                    tenantId, employeeId, pageable);
        }
        return repository.findByTenantIdAndDeletedAtIsNullOrderByCreatedAtDesc(tenantId, pageable);
    }

    @Transactional(readOnly = true)
    public Certification getById(UUID tenantId, UUID id) {
        return repository.findByIdAndTenantIdAndDeletedAtIsNull(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Certification not found: " + id));
    }

    @Transactional
    public Certification create(UUID tenantId, CreateCertificationRequest req) {
        Certification cert = Certification.builder()
                .tenantId(tenantId)
                .employeeId(req.getEmployeeId())
                .certName(req.getCertName())
                .certNumber(req.getCertNumber())
                .issuedBy(req.getIssuedBy())
                .issuedDate(req.getIssuedDate())
                .expiryDate(req.getExpiryDate())
                .documentUrl(req.getDocumentUrl())
                .build();
        return repository.save(cert);
    }

    @Transactional
    public Certification update(UUID tenantId, UUID id, CreateCertificationRequest req) {
        Certification cert = getById(tenantId, id);
        cert.setCertName(req.getCertName());
        cert.setCertNumber(req.getCertNumber());
        cert.setIssuedBy(req.getIssuedBy());
        cert.setIssuedDate(req.getIssuedDate());
        cert.setExpiryDate(req.getExpiryDate());
        cert.setDocumentUrl(req.getDocumentUrl());
        return repository.save(cert);
    }

    @Transactional
    public void revoke(UUID tenantId, UUID id) {
        Certification cert = getById(tenantId, id);
        cert.setStatus(CertificationStatus.REVOKED);
        repository.save(cert);
    }

    @Transactional
    public void delete(UUID tenantId, UUID id) {
        Certification cert = getById(tenantId, id);
        cert.setDeletedAt(Instant.now());
        repository.save(cert);
    }
}
