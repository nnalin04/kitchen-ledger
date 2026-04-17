package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.dto.request.CreateSupplierRequest;
import com.kitchenledger.inventory.exception.ConflictException;
import com.kitchenledger.inventory.exception.ResourceNotFoundException;
import com.kitchenledger.inventory.model.Supplier;
import com.kitchenledger.inventory.repository.SupplierRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class SupplierService {

    private final SupplierRepository supplierRepository;

    @Transactional(readOnly = true)
    public List<Supplier> listByTenant(UUID tenantId) {
        return supplierRepository.findByTenantIdAndDeletedAtIsNull(tenantId);
    }

    @Transactional(readOnly = true)
    public Supplier getById(UUID tenantId, UUID id) {
        return supplierRepository.findByIdAndTenantIdAndDeletedAtIsNull(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Supplier not found: " + id));
    }

    @Transactional
    public Supplier create(UUID tenantId, CreateSupplierRequest req) {
        if (supplierRepository.existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(tenantId, req.getName())) {
            throw new ConflictException("Supplier already exists: " + req.getName());
        }
        Supplier supplier = Supplier.builder()
                .tenantId(tenantId)
                .name(req.getName())
                .contactName(req.getContactName())
                .email(req.getEmail())
                .phone(req.getPhone())
                .whatsapp(req.getWhatsapp())
                .address(req.getAddress())
                .paymentTermsDays(req.getPaymentTermsDays())
                .leadTimeDays(req.getLeadTimeDays())
                .notes(req.getNotes())
                .build();
        return supplierRepository.save(supplier);
    }

    @Transactional
    public Supplier update(UUID tenantId, UUID id, CreateSupplierRequest req) {
        Supplier supplier = getById(tenantId, id);
        if (!supplier.getName().equalsIgnoreCase(req.getName())
                && supplierRepository.existsByTenantIdAndNameIgnoreCaseAndDeletedAtIsNull(tenantId, req.getName())) {
            throw new ConflictException("Supplier name already in use: " + req.getName());
        }
        supplier.setName(req.getName());
        supplier.setContactName(req.getContactName());
        supplier.setEmail(req.getEmail());
        supplier.setPhone(req.getPhone());
        supplier.setWhatsapp(req.getWhatsapp());
        supplier.setAddress(req.getAddress());
        supplier.setPaymentTermsDays(req.getPaymentTermsDays());
        supplier.setLeadTimeDays(req.getLeadTimeDays());
        supplier.setNotes(req.getNotes());
        return supplierRepository.save(supplier);
    }

    @Transactional
    public void delete(UUID tenantId, UUID id) {
        Supplier supplier = getById(tenantId, id);
        supplier.setDeletedAt(Instant.now());
        supplier.setActive(false);
        supplierRepository.save(supplier);
    }
}
