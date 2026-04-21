package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.CreateShiftRequest;
import com.kitchenledger.staff.event.StaffEventPublisher;
import com.kitchenledger.staff.exception.ResourceNotFoundException;
import com.kitchenledger.staff.exception.ValidationException;
import com.kitchenledger.staff.model.Shift;
import com.kitchenledger.staff.model.enums.ShiftStatus;
import com.kitchenledger.staff.repository.ShiftRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ShiftService {

    /** Minimum rest gap between consecutive shifts before a clopen is flagged (hours). */
    private static final int MIN_REST_HOURS = 8;
    /** Minimum advance days required to publish a schedule without an override. */
    private static final int MIN_PUBLISH_ADVANCE_DAYS = 14;

    private final ShiftRepository shiftRepository;
    private final StaffEventPublisher eventPublisher;

    @Transactional(readOnly = true)
    public List<Shift> listByDate(UUID tenantId, LocalDate date) {
        return shiftRepository.findByTenantIdAndShiftDateOrderByStartTimeAsc(tenantId, date);
    }

    @Transactional(readOnly = true)
    public List<Shift> listByDateRange(UUID tenantId, LocalDate from, LocalDate to) {
        return shiftRepository.findByTenantIdAndShiftDateBetweenOrderByShiftDateAscStartTimeAsc(
                tenantId, from, to);
    }

    @Transactional(readOnly = true)
    public List<Shift> listByEmployee(UUID tenantId, UUID employeeId, LocalDate from, LocalDate to) {
        return shiftRepository.findByTenantIdAndEmployeeIdAndShiftDateBetween(
                tenantId, employeeId, from, to);
    }

    @Transactional(readOnly = true)
    public Shift getById(UUID tenantId, UUID id) {
        return shiftRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Shift not found: " + id));
    }

    @Transactional
    public Shift create(UUID tenantId, UUID createdBy, CreateShiftRequest req) {
        boolean crossMidnight = req.isEndsNextDay();

        // A non-cross-midnight shift must have startTime < endTime
        if (!crossMidnight && !req.getStartTime().isBefore(req.getEndTime())) {
            throw new ValidationException(
                    "Shift end_time must be after start_time. For overnight shifts, set ends_next_day=true.");
        }

        // Overlap check: no two non-cancelled shifts for the same employee can overlap
        if (shiftRepository.existsByTenantIdAndEmployeeIdAndShiftDateAndStatusNotAndStartTimeLessThanAndEndTimeGreaterThan(
                tenantId, req.getEmployeeId(), req.getShiftDate(),
                ShiftStatus.cancelled,
                req.getEndTime(), req.getStartTime())) {
            throw new ValidationException(
                    "Employee already has an overlapping shift on " + req.getShiftDate());
        }

        // Clopen prevention: check rest gap against adjacent shifts in a 2-day window
        checkClopenRule(tenantId, req);

        Shift shift = Shift.builder()
                .tenantId(tenantId)
                .employeeId(req.getEmployeeId())
                .shiftDate(req.getShiftDate())
                .startTime(req.getStartTime())
                .endTime(req.getEndTime())
                .endsNextDay(crossMidnight)
                .roleLabel(req.getRoleLabel())
                .station(req.getStation())
                .notes(req.getNotes())
                .createdBy(createdBy)
                .build();
        Shift saved = shiftRepository.save(shift);
        eventPublisher.publishShiftCreated(tenantId, saved.getId(),
                saved.getEmployeeId(), saved.getShiftDate().toString());
        return saved;
    }

    @Transactional
    public Shift updateStatus(UUID tenantId, UUID id, ShiftStatus status) {
        Shift shift = getById(tenantId, id);
        shift.setStatus(status);
        return shiftRepository.save(shift);
    }

    /** Publishes all scheduled shifts for the given date range, making them visible to employees.
     *  Rejects if any shift starts within the minimum advance window (14 days by default). */
    @Transactional
    public int publish(UUID tenantId, LocalDate from, LocalDate to) {
        LocalDate minAllowedStart = LocalDate.now().plusDays(MIN_PUBLISH_ADVANCE_DAYS);
        if (from.isBefore(minAllowedStart)) {
            throw new ValidationException(
                    "Cannot publish schedules starting before " + minAllowedStart
                    + ". Schedules must be published at least " + MIN_PUBLISH_ADVANCE_DAYS
                    + " days in advance.");
        }

        List<Shift> shifts = shiftRepository
                .findByTenantIdAndShiftDateBetweenOrderByShiftDateAscStartTimeAsc(tenantId, from, to);
        int count = 0;
        for (Shift s : shifts) {
            if (s.getStatus() == ShiftStatus.scheduled) {
                s.setStatus(ShiftStatus.published);
                shiftRepository.save(s);
                count++;
            }
        }
        return count;
    }

    private void checkClopenRule(UUID tenantId, CreateShiftRequest req) {
        LocalDate lookbackStart = req.getShiftDate().minusDays(1);
        LocalDate lookbackEnd   = req.getShiftDate().plusDays(1);

        List<Shift> adjacent = shiftRepository.findByTenantIdAndEmployeeIdAndShiftDateBetween(
                tenantId, req.getEmployeeId(), lookbackStart, lookbackEnd);

        LocalDateTime newShiftStart = req.getShiftDate().atTime(req.getStartTime());
        LocalDateTime newShiftEnd = req.isEndsNextDay()
                ? req.getShiftDate().plusDays(1).atTime(req.getEndTime())
                : req.getShiftDate().atTime(req.getEndTime());

        for (Shift existing : adjacent) {
            if (existing.getStatus() == ShiftStatus.cancelled) continue;

            LocalDateTime existingEnd = existing.isEndsNextDay()
                    ? existing.getShiftDate().plusDays(1).atTime(existing.getEndTime())
                    : existing.getShiftDate().atTime(existing.getEndTime());
            LocalDateTime existingStart = existing.getShiftDate().atTime(existing.getStartTime());

            long gapAfterExisting  = java.time.Duration.between(existingEnd, newShiftStart).toHours();
            long gapBeforeExisting = java.time.Duration.between(newShiftEnd, existingStart).toHours();

            if ((gapAfterExisting >= 0 && gapAfterExisting < MIN_REST_HOURS)
                    || (gapBeforeExisting >= 0 && gapBeforeExisting < MIN_REST_HOURS)) {
                throw new ValidationException(
                        "Shift creates a clopen scenario: less than " + MIN_REST_HOURS
                        + "h rest gap required between consecutive shifts.");
            }
        }
    }

    @Transactional
    public void delete(UUID tenantId, UUID id) {
        Shift shift = getById(tenantId, id);
        if (shift.getStatus() == ShiftStatus.published || shift.getStatus() == ShiftStatus.confirmed) {
            throw new ValidationException("Cannot delete a published or confirmed shift.");
        }
        shift.setDeletedAt(java.time.Instant.now());
        shiftRepository.save(shift);
    }
}
