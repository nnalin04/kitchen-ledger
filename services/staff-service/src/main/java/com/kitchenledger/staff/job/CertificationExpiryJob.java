package com.kitchenledger.staff.job;

import com.kitchenledger.staff.event.StaffEventPublisher;
import com.kitchenledger.staff.model.Certification;
import com.kitchenledger.staff.model.enums.CertificationStatus;
import com.kitchenledger.staff.repository.CertificationRepository;
import com.kitchenledger.staff.repository.EmployeeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

/**
 * Runs daily at 08:00 and fires a {@code staff.certification.expiring} event
 * for every active certification that expires within the next 30 days.
 * Also auto-marks past-due certs as EXPIRED.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class CertificationExpiryJob {

    private static final int ALERT_DAYS_AHEAD = 30;

    private final CertificationRepository certificationRepository;
    private final EmployeeRepository employeeRepository;
    private final StaffEventPublisher eventPublisher;

    @Scheduled(cron = "0 0 8 * * *") // 08:00 every day
    public void checkCertificationExpiry() {
        LocalDate today            = LocalDate.now();
        LocalDate alertThreshold   = today.plusDays(ALERT_DAYS_AHEAD);

        // Alert: certs expiring within next 30 days
        List<Certification> expiringSoon = certificationRepository
                .findByStatusAndExpiryDateBeforeAndDeletedAtIsNull(
                        CertificationStatus.ACTIVE, alertThreshold);

        log.info("Certification expiry check: {} cert(s) expiring within {} days",
                expiringSoon.size(), ALERT_DAYS_AHEAD);

        int failures = 0;
        for (Certification cert : expiringSoon) {
            try {
                processOneCert(cert, today);
            // Intentionally broad: job must not abort remaining items on any single failure
            } catch (Exception e) {
                failures++;
                log.error("CertificationExpiryJob failed for tenant {}: {}", cert.getTenantId(), e.getMessage());
            }
        }
        log.info("CertificationExpiryJob completed: {} certs processed, {} failed",
                expiringSoon.size(), failures);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void processOneCert(Certification cert, LocalDate today) {
        if (cert.getExpiryDate() == null) return;

        // Auto-expire overdue certs
        if (cert.getExpiryDate().isBefore(today)) {
            cert.setStatus(CertificationStatus.EXPIRED);
            certificationRepository.save(cert);
            log.info("Auto-expired certification {} for employee {}", cert.getCertName(), cert.getEmployeeId());
            return;
        }

        // Fire expiry alert for certs still active but approaching expiry
        employeeRepository.findByIdAndTenantIdAndDeletedAtIsNull(cert.getEmployeeId(), cert.getTenantId())
                .ifPresent(emp -> {
                    String employeeName = emp.getFirstName() + " " + emp.getLastName();
                    eventPublisher.publishCertificationExpiring(
                            cert.getTenantId(),
                            cert.getEmployeeId(),
                            employeeName,
                            cert.getCertName(),
                            cert.getExpiryDate().toString()
                    );
                    log.info("Certification expiry alert fired for {} — cert '{}' expires {}",
                            employeeName, cert.getCertName(), cert.getExpiryDate());
                });
    }
}
