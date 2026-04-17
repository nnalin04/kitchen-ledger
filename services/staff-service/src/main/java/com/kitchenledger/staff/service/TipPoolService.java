package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.CreateTipPoolRequest;
import com.kitchenledger.staff.exception.ConflictException;
import com.kitchenledger.staff.exception.ResourceNotFoundException;
import com.kitchenledger.staff.model.TipPool;
import com.kitchenledger.staff.repository.TipPoolRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TipPoolService {

    private final TipPoolRepository tipPoolRepository;

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

    @Transactional
    public TipPool distribute(UUID tenantId, UUID id) {
        TipPool pool = getById(tenantId, id);
        if (pool.isDistributed()) {
            throw new ConflictException("Tip pool already distributed.");
        }
        pool.setDistributed(true);
        pool.setDistributedAt(Instant.now());
        return tipPoolRepository.save(pool);
    }
}
