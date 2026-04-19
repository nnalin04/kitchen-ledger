package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.CreateTimeOffRequest;
import com.kitchenledger.staff.dto.request.ReviewTimeOffRequest;
import com.kitchenledger.staff.exception.ConflictException;
import com.kitchenledger.staff.exception.ResourceNotFoundException;
import com.kitchenledger.staff.exception.ValidationException;
import com.kitchenledger.staff.model.TimeOffRequest;
import com.kitchenledger.staff.model.enums.TimeOffStatus;
import com.kitchenledger.staff.repository.TimeOffRequestRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TimeOffService {

    private final TimeOffRequestRepository repository;

    @Transactional(readOnly = true)
    public Page<TimeOffRequest> list(UUID tenantId, UUID employeeId, TimeOffStatus status, Pageable pageable) {
        if (employeeId != null) {
            return repository.findByTenantIdAndEmployeeIdAndDeletedAtIsNullOrderByCreatedAtDesc(
                    tenantId, employeeId, pageable);
        }
        if (status != null) {
            return repository.findByTenantIdAndStatusAndDeletedAtIsNullOrderByCreatedAtDesc(
                    tenantId, status, pageable);
        }
        return repository.findByTenantIdAndDeletedAtIsNullOrderByCreatedAtDesc(tenantId, pageable);
    }

    @Transactional(readOnly = true)
    public TimeOffRequest getById(UUID tenantId, UUID id) {
        return repository.findByIdAndTenantIdAndDeletedAtIsNull(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Time-off request not found: " + id));
    }

    @Transactional
    public TimeOffRequest create(UUID tenantId, CreateTimeOffRequest req) {
        if (req.getEndDate().isBefore(req.getStartDate())) {
            throw new ValidationException("endDate must be on or after startDate");
        }
        TimeOffRequest request = TimeOffRequest.builder()
                .tenantId(tenantId)
                .employeeId(req.getEmployeeId())
                .requestType(req.getRequestType())
                .startDate(req.getStartDate())
                .endDate(req.getEndDate())
                .reason(req.getReason())
                .build();
        return repository.save(request);
    }

    @Transactional
    public TimeOffRequest approve(UUID tenantId, UUID id, UUID reviewerId, ReviewTimeOffRequest review) {
        TimeOffRequest request = getById(tenantId, id);
        if (request.getStatus() != TimeOffStatus.PENDING) {
            throw new ConflictException("Only PENDING requests can be approved");
        }
        request.setStatus(TimeOffStatus.APPROVED);
        request.setReviewedBy(reviewerId);
        request.setReviewedAt(Instant.now());
        request.setReviewNotes(review != null ? review.getReviewNotes() : null);
        return repository.save(request);
    }

    @Transactional
    public TimeOffRequest deny(UUID tenantId, UUID id, UUID reviewerId, ReviewTimeOffRequest review) {
        TimeOffRequest request = getById(tenantId, id);
        if (request.getStatus() != TimeOffStatus.PENDING) {
            throw new ConflictException("Only PENDING requests can be denied");
        }
        request.setStatus(TimeOffStatus.DENIED);
        request.setReviewedBy(reviewerId);
        request.setReviewedAt(Instant.now());
        request.setReviewNotes(review != null ? review.getReviewNotes() : null);
        return repository.save(request);
    }

    @Transactional
    public void cancel(UUID tenantId, UUID id, UUID requestingUserId) {
        TimeOffRequest request = getById(tenantId, id);
        if (request.getStatus() == TimeOffStatus.APPROVED || request.getStatus() == TimeOffStatus.DENIED) {
            throw new ConflictException("Cannot cancel an already reviewed request");
        }
        request.setStatus(TimeOffStatus.CANCELLED);
        request.setDeletedAt(Instant.now());
        repository.save(request);
    }
}
