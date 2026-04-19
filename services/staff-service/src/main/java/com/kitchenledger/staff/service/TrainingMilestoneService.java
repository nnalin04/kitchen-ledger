package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.CreateTrainingMilestoneRequest;
import com.kitchenledger.staff.exception.ConflictException;
import com.kitchenledger.staff.exception.ResourceNotFoundException;
import com.kitchenledger.staff.model.TrainingMilestone;
import com.kitchenledger.staff.model.enums.TrainingStatus;
import com.kitchenledger.staff.repository.TrainingMilestoneRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TrainingMilestoneService {

    private final TrainingMilestoneRepository repository;

    @Transactional(readOnly = true)
    public Page<TrainingMilestone> list(UUID tenantId, UUID employeeId, Pageable pageable) {
        if (employeeId != null) {
            return repository.findByTenantIdAndEmployeeIdOrderByCreatedAtDesc(tenantId, employeeId, pageable);
        }
        return repository.findByTenantIdOrderByCreatedAtDesc(tenantId, pageable);
    }

    @Transactional(readOnly = true)
    public TrainingMilestone getById(UUID tenantId, UUID id) {
        return repository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Training milestone not found: " + id));
    }

    @Transactional
    public TrainingMilestone create(UUID tenantId, CreateTrainingMilestoneRequest req) {
        TrainingMilestone milestone = TrainingMilestone.builder()
                .tenantId(tenantId)
                .employeeId(req.getEmployeeId())
                .milestoneName(req.getMilestoneName())
                .category(req.getCategory())
                .targetDate(req.getTargetDate())
                .notes(req.getNotes())
                .build();
        return repository.save(milestone);
    }

    @Transactional
    public TrainingMilestone markInProgress(UUID tenantId, UUID id) {
        TrainingMilestone milestone = getById(tenantId, id);
        if (milestone.getStatus() == TrainingStatus.COMPLETED) {
            throw new ConflictException("Completed milestones cannot be reverted");
        }
        milestone.setStatus(TrainingStatus.IN_PROGRESS);
        return repository.save(milestone);
    }

    @Transactional
    public TrainingMilestone complete(UUID tenantId, UUID id) {
        TrainingMilestone milestone = getById(tenantId, id);
        if (milestone.getStatus() == TrainingStatus.COMPLETED) {
            throw new ConflictException("Milestone is already completed");
        }
        milestone.setStatus(TrainingStatus.COMPLETED);
        milestone.setCompletedDate(LocalDate.now());
        return repository.save(milestone);
    }
}
