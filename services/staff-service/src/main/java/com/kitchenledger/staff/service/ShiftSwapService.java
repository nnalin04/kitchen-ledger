package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.CreateShiftSwapRequest;
import com.kitchenledger.staff.exception.ConflictException;
import com.kitchenledger.staff.exception.ResourceNotFoundException;
import com.kitchenledger.staff.model.ShiftSwap;
import com.kitchenledger.staff.model.enums.ShiftSwapStatus;
import com.kitchenledger.staff.repository.ShiftSwapRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class ShiftSwapService {

    private final ShiftSwapRepository repository;

    @Transactional(readOnly = true)
    public Page<ShiftSwap> list(UUID tenantId, ShiftSwapStatus status, Pageable pageable) {
        if (status != null) {
            return repository.findByTenantIdAndStatusOrderByCreatedAtDesc(tenantId, status, pageable);
        }
        return repository.findByTenantIdOrderByCreatedAtDesc(tenantId, pageable);
    }

    @Transactional(readOnly = true)
    public ShiftSwap getById(UUID tenantId, UUID id) {
        return repository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Shift swap not found: " + id));
    }

    @Transactional
    public ShiftSwap request(UUID tenantId, UUID requestingEmployeeId, CreateShiftSwapRequest req) {
        ShiftSwap swap = ShiftSwap.builder()
                .tenantId(tenantId)
                .requestingEmployeeId(requestingEmployeeId)
                .targetEmployeeId(req.getTargetEmployeeId())
                .originalShiftId(req.getOriginalShiftId())
                .targetShiftId(req.getTargetShiftId())
                .requestReason(req.getRequestReason())
                .build();
        return repository.save(swap);
    }

    @Transactional
    public ShiftSwap acceptByEmployee(UUID tenantId, UUID id) {
        ShiftSwap swap = getById(tenantId, id);
        if (swap.getStatus() != ShiftSwapStatus.PENDING) {
            throw new ConflictException("Only PENDING swaps can be accepted by the target employee");
        }
        swap.setStatus(ShiftSwapStatus.ACCEPTED_BY_EMPLOYEE);
        return repository.save(swap);
    }

    @Transactional
    public ShiftSwap approve(UUID tenantId, UUID id, UUID reviewerId) {
        ShiftSwap swap = getById(tenantId, id);
        if (swap.getStatus() != ShiftSwapStatus.ACCEPTED_BY_EMPLOYEE) {
            throw new ConflictException("Swap must be accepted by the target employee before manager approval");
        }
        swap.setStatus(ShiftSwapStatus.APPROVED);
        swap.setReviewedBy(reviewerId);
        swap.setReviewedAt(Instant.now());
        return repository.save(swap);
    }

    @Transactional
    public ShiftSwap deny(UUID tenantId, UUID id, UUID reviewerId) {
        ShiftSwap swap = getById(tenantId, id);
        if (swap.getStatus() == ShiftSwapStatus.APPROVED || swap.getStatus() == ShiftSwapStatus.CANCELLED) {
            throw new ConflictException("Cannot deny a swap that is already " + swap.getStatus());
        }
        swap.setStatus(ShiftSwapStatus.DENIED);
        swap.setReviewedBy(reviewerId);
        swap.setReviewedAt(Instant.now());
        return repository.save(swap);
    }

    @Transactional
    public ShiftSwap cancel(UUID tenantId, UUID id) {
        ShiftSwap swap = getById(tenantId, id);
        if (swap.getStatus() == ShiftSwapStatus.APPROVED || swap.getStatus() == ShiftSwapStatus.DENIED) {
            throw new ConflictException("Cannot cancel a swap that is already " + swap.getStatus());
        }
        swap.setStatus(ShiftSwapStatus.CANCELLED);
        return repository.save(swap);
    }
}
