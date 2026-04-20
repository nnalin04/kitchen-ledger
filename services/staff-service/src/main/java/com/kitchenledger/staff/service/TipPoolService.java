package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.CreateTipPoolRequest;
import com.kitchenledger.staff.event.StaffEventPublisher;
import com.kitchenledger.staff.exception.ConflictException;
import com.kitchenledger.staff.exception.ResourceNotFoundException;
import com.kitchenledger.staff.exception.ValidationException;
import com.kitchenledger.staff.model.Employee;
import com.kitchenledger.staff.model.TipPool;
import com.kitchenledger.staff.model.TipPoolDistribution;
import com.kitchenledger.staff.repository.EmployeeRepository;
import com.kitchenledger.staff.repository.TipPoolDistributionRepository;
import com.kitchenledger.staff.repository.TipPoolRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TipPoolService {

    private final TipPoolRepository tipPoolRepository;
    private final TipPoolDistributionRepository distributionRepository;
    private final EmployeeRepository employeeRepository;
    private final StaffEventPublisher eventPublisher;

    @Transactional(readOnly = true)
    public Page<TipPool> list(UUID tenantId, Pageable pageable) {
        return tipPoolRepository.findByTenantIdOrderByPoolDateDesc(tenantId, pageable);
    }

    @Transactional(readOnly = true)
    public TipPool getById(UUID tenantId, UUID id) {
        return tipPoolRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Tip pool not found: " + id));
    }

    @Transactional
    public TipPool create(UUID tenantId, UUID createdBy, CreateTipPoolRequest req) {
        if (tipPoolRepository.findByTenantIdAndPoolDate(tenantId, req.getPoolDate()).isPresent()) {
            throw new ConflictException("Tip pool already exists for date: " + req.getPoolDate());
        }
        TipPool pool = TipPool.builder()
                .tenantId(tenantId)
                .poolDate(req.getPoolDate())
                .totalAmount(req.getTotalAmount())
                .distributionMethod(req.getDistributionMethod())
                .notes(req.getNotes())
                .createdBy(createdBy)
                .build();
        return tipPoolRepository.save(pool);
    }

    /**
     * Distributes the tip pool equally among all active employees of the tenant.
     * Writes one {@link TipPoolDistribution} row per employee within the same transaction,
     * then marks the pool as distributed. Re-calling on an already-distributed pool returns 409.
     */
    @Transactional
    public TipPool distribute(UUID tenantId, UUID id) {
        TipPool pool = getById(tenantId, id);
        if (pool.isDistributed()) {
            throw new ConflictException("Tip pool already distributed.");
        }

        List<Employee> employees = employeeRepository
                .findByTenantIdAndActiveTrueAndDeletedAtIsNull(tenantId);
        if (employees.isEmpty()) {
            throw new ValidationException("Cannot distribute: no eligible employees for tenant " + tenantId);
        }

        BigDecimal share = pool.getTotalAmount()
                .divide(BigDecimal.valueOf(employees.size()), 2, RoundingMode.FLOOR);
        BigDecimal remainder = pool.getTotalAmount()
                .subtract(share.multiply(BigDecimal.valueOf(employees.size())));

        Instant now = Instant.now();
        for (int i = 0; i < employees.size(); i++) {
            // Add remainder to first employee to ensure total = pool amount
            BigDecimal amount = (i == 0) ? share.add(remainder) : share;
            distributionRepository.save(TipPoolDistribution.builder()
                    .tenantId(tenantId)
                    .tipPoolId(pool.getId())
                    .employeeId(employees.get(i).getId())
                    .amount(amount)
                    .distributedAt(now)
                    .build());
        }

        pool.setDistributed(true);
        pool.setDistributedAt(now);
        TipPool saved = tipPoolRepository.save(pool);
        eventPublisher.publishTipDistributed(tenantId, pool.getId(), pool.getTotalAmount());
        return saved;
    }
}
