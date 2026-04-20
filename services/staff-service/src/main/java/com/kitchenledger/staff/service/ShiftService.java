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
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ShiftService {

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
        if (!req.getStartTime().isBefore(req.getEndTime())) {
            throw new ValidationException("Shift start_time must be before end_time.");
        }
        // Overlap check: no two non-cancelled shifts for the same employee can overlap
        if (shiftRepository.existsByTenantIdAndEmployeeIdAndShiftDateAndStatusNotAndStartTimeLessThanAndEndTimeGreaterThan(
                tenantId, req.getEmployeeId(), req.getShiftDate(),
                ShiftStatus.cancelled,
                req.getEndTime(), req.getStartTime())) {
            throw new ValidationException(
                    "Employee already has an overlapping shift on " + req.getShiftDate());
        }
        Shift shift = Shift.builder()
                .tenantId(tenantId)
                .employeeId(req.getEmployeeId())
                .shiftDate(req.getShiftDate())
                .startTime(req.getStartTime())
                .endTime(req.getEndTime())
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

    /** Publishes all scheduled shifts for the given date range, making them visible to employees. */
    @Transactional
    public int publish(UUID tenantId, LocalDate from, LocalDate to) {
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

    @Transactional
    public void delete(UUID tenantId, UUID id) {
        Shift shift = getById(tenantId, id);
        if (shift.getStatus() == ShiftStatus.published || shift.getStatus() == ShiftStatus.confirmed) {
            throw new ValidationException("Cannot delete a published or confirmed shift.");
        }
        shiftRepository.delete(shift);
    }
}
