package com.kitchenledger.staff.repository;

import com.kitchenledger.staff.model.Certification;
import com.kitchenledger.staff.model.enums.CertificationStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CertificationRepository extends JpaRepository<Certification, UUID> {

    Page<Certification> findByTenantIdAndDeletedAtIsNullOrderByCreatedAtDesc(UUID tenantId, Pageable pageable);

    Page<Certification> findByTenantIdAndEmployeeIdAndDeletedAtIsNullOrderByCreatedAtDesc(
            UUID tenantId, UUID employeeId, Pageable pageable);

    Optional<Certification> findByIdAndTenantIdAndDeletedAtIsNull(UUID id, UUID tenantId);

    /** Used by certification expiry job to find certs expiring before the given date. */
    List<Certification> findByStatusAndExpiryDateBeforeAndDeletedAtIsNull(
            CertificationStatus status, LocalDate expiryDate);
}
