package com.kitchenledger.finance.service;

import com.kitchenledger.finance.dto.request.CreateVendorPaymentRequest;
import com.kitchenledger.finance.exception.ResourceNotFoundException;
import com.kitchenledger.finance.model.Vendor;
import com.kitchenledger.finance.model.VendorPayment;
import com.kitchenledger.finance.repository.VendorPaymentRepository;
import com.kitchenledger.finance.repository.VendorRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class VendorPaymentService {

    private final VendorPaymentRepository paymentRepository;
    private final VendorRepository vendorRepository;

    @Transactional(readOnly = true)
    public Page<VendorPayment> list(UUID tenantId, UUID vendorId, Pageable pageable) {
        if (vendorId != null) {
            return paymentRepository.findByTenantIdAndVendorIdOrderByPaymentDateDesc(
                    tenantId, vendorId, pageable);
        }
        return paymentRepository.findByTenantIdOrderByPaymentDateDesc(tenantId, pageable);
    }

    @Transactional
    public VendorPayment create(UUID tenantId, UUID createdBy, CreateVendorPaymentRequest req) {
        Vendor vendor = vendorRepository.findByIdAndTenantIdAndDeletedAtIsNull(req.getVendorId(), tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Vendor not found: " + req.getVendorId()));

        VendorPayment payment = VendorPayment.builder()
                .tenantId(tenantId)
                .vendorId(req.getVendorId())
                .expenseId(req.getExpenseId())
                .paymentDate(req.getPaymentDate())
                .amount(req.getAmount())
                .paymentMethod(req.getPaymentMethod())
                .referenceNumber(req.getReferenceNumber())
                .notes(req.getNotes())
                .dueDate(req.getDueDate())
                .paymentStatus(req.getPaymentStatus() != null ? req.getPaymentStatus() : "paid")
                .createdBy(createdBy)
                .build();

        // Decrement vendor outstanding balance
        vendor.setOutstandingBalance(
                vendor.getOutstandingBalance().subtract(req.getAmount()).max(java.math.BigDecimal.ZERO));
        vendorRepository.save(vendor);

        return paymentRepository.save(payment);
    }
}
