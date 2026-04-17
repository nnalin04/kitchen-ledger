package com.kitchenledger.finance.service;

import com.kitchenledger.finance.dto.request.CreateVendorRequest;
import com.kitchenledger.finance.exception.ConflictException;
import com.kitchenledger.finance.exception.ResourceNotFoundException;
import com.kitchenledger.finance.model.Vendor;
import com.kitchenledger.finance.repository.VendorRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class VendorService {

    private final VendorRepository vendorRepository;

    @Transactional(readOnly = true)
    public List<Vendor> listByTenant(UUID tenantId) {
        return vendorRepository.findByTenantIdAndDeletedAtIsNull(tenantId);
    }

    @Transactional(readOnly = true)
    public Vendor getById(UUID tenantId, UUID id) {
        return vendorRepository.findByIdAndTenantIdAndDeletedAtIsNull(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Vendor not found: " + id));
    }

    @Transactional
    public Vendor create(UUID tenantId, CreateVendorRequest req) {
        if (vendorRepository.existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(tenantId, req.getName())) {
            throw new ConflictException("Vendor already exists: " + req.getName());
        }
        Vendor vendor = Vendor.builder()
                .tenantId(tenantId)
                .name(req.getName())
                .contactName(req.getContactName())
                .email(req.getEmail())
                .phone(req.getPhone())
                .gstin(req.getGstin())
                .paymentTermsDays(req.getPaymentTermsDays())
                .notes(req.getNotes())
                .build();
        return vendorRepository.save(vendor);
    }

    @Transactional
    public Vendor update(UUID tenantId, UUID id, CreateVendorRequest req) {
        Vendor vendor = getById(tenantId, id);
        if (!vendor.getName().equalsIgnoreCase(req.getName())
                && vendorRepository.existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(tenantId, req.getName())) {
            throw new ConflictException("Vendor name already in use: " + req.getName());
        }
        vendor.setName(req.getName());
        vendor.setContactName(req.getContactName());
        vendor.setEmail(req.getEmail());
        vendor.setPhone(req.getPhone());
        vendor.setGstin(req.getGstin());
        vendor.setPaymentTermsDays(req.getPaymentTermsDays());
        vendor.setNotes(req.getNotes());
        return vendorRepository.save(vendor);
    }

    @Transactional
    public void delete(UUID tenantId, UUID id) {
        Vendor vendor = getById(tenantId, id);
        vendor.setDeletedAt(Instant.now());
        vendor.setActive(false);
        vendorRepository.save(vendor);
    }
}
