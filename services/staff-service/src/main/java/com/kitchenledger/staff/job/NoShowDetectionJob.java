package com.kitchenledger.staff.job;

import com.kitchenledger.staff.event.StaffEventPublisher;
import com.kitchenledger.staff.model.Employee;
import com.kitchenledger.staff.model.Shift;
import com.kitchenledger.staff.model.enums.ShiftStatus;
import com.kitchenledger.staff.repository.AttendanceRepository;
import com.kitchenledger.staff.repository.EmployeeRepository;
import com.kitchenledger.staff.repository.ShiftRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;

/**
 * Runs every 15 minutes and detects employees who have not clocked in
 * within 15 minutes of their scheduled shift start time.  Marks the shift
 * as {@code no_show} and publishes a {@code staff.employee.noshow} event.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class NoShowDetectionJob {

    private final ShiftRepository       shiftRepository;
    private final AttendanceRepository  attendanceRepository;
    private final EmployeeRepository    employeeRepository;
    private final StaffEventPublisher   eventPublisher;

    private static final int BATCH_SIZE = 100;

    @Scheduled(cron = "0 */15 * * * *") // every 15 minutes
    public void detectNoShows() {
        log.info("NoShowDetectionJob starting — batch size {}", BATCH_SIZE);

        LocalDate today         = LocalDate.now();
        // Threshold: shifts that started more than 15 minutes ago
        LocalTime thresholdTime = LocalTime.now().minusMinutes(15);

        List<ShiftStatus> liveStatuses =
                List.of(ShiftStatus.scheduled, ShiftStatus.published, ShiftStatus.confirmed);

        int pageNumber  = 0;
        int totalFound  = 0;
        int failures    = 0;

        Page<Shift> page;
        do {
            PageRequest pageable = PageRequest.of(pageNumber, BATCH_SIZE, Sort.by("id"));
            page = shiftRepository.findByStatusInAndShiftDateAndStartTimeBefore(
                    liveStatuses, today, thresholdTime, pageable);

            if (page.isEmpty()) break;

            log.info("No-show check page {}: {} overdue shift(s)", pageNumber, page.getNumberOfElements());
            totalFound += page.getNumberOfElements();

            for (Shift shift : page) {
                try {
                    processOneShift(shift);
                // Intentionally broad: job must not abort remaining items on any single failure
                } catch (Exception e) {
                    failures++;
                    log.error("NoShowDetectionJob failed for tenant {}: {}", shift.getTenantId(), e.getMessage());
                }
            }
            pageNumber++;
        } while (page.getNumberOfElements() == BATCH_SIZE);

        log.info("NoShowDetectionJob completed: {} shifts processed, {} failed", totalFound, failures);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void processOneShift(Shift shift) {
        boolean hasClockedIn = attendanceRepository
            .existsByShiftIdAndTenantId(shift.getId(), shift.getTenantId());

        if (!hasClockedIn) {
            shift.setStatus(ShiftStatus.no_show);
            shiftRepository.save(shift);
            log.warn("No-show detected and marked: shift={} employee={} tenant={}",
                shift.getId(), shift.getEmployeeId(), shift.getTenantId());

            Optional<Employee> employeeOpt = employeeRepository
                .findByIdAndTenantIdAndDeletedAtIsNull(shift.getEmployeeId(), shift.getTenantId());

            String employeeName = employeeOpt
                .map(e -> e.getFirstName() + " " + e.getLastName())
                .orElse("Unknown Employee");

            eventPublisher.publishEmployeeNoShow(
                shift.getTenantId(),
                shift.getId(),
                shift.getEmployeeId(),
                employeeName,
                shift.getShiftDate(),
                shift.getStartTime()
            );
        }
    }
}
