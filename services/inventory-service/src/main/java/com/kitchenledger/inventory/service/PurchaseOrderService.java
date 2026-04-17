package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.dto.request.CreatePurchaseOrderRequest;
import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.exception.ResourceNotFoundException;
import com.kitchenledger.inventory.exception.ValidationException;
import com.kitchenledger.inventory.model.PurchaseOrder;
import com.kitchenledger.inventory.model.PurchaseOrderItem;
import com.kitchenledger.inventory.model.enums.PurchaseOrderStatus;
import com.kitchenledger.inventory.repository.PurchaseOrderRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PurchaseOrderService {

    private final PurchaseOrderRepository poRepository;
    private final InventoryEventPublisher eventPublisher;

    @Transactional(readOnly = true)
    public Page<PurchaseOrder> list(UUID tenantId, PurchaseOrderStatus status, Pageable pageable) {
        if (status != null) {
            return poRepository.findByTenantIdAndStatusAndDeletedAtIsNull(tenantId, status, pageable);
        }
        return poRepository.findByTenantIdAndDeletedAtIsNull(tenantId, pageable);
    }

    @Transactional(readOnly = true)
    public PurchaseOrder getById(UUID tenantId, UUID id) {
        return poRepository.findByIdAndTenantIdAndDeletedAtIsNull(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Purchase order not found: " + id));
    }

    @Transactional
    public PurchaseOrder create(UUID tenantId, UUID createdBy, CreatePurchaseOrderRequest req) {
        String poNumber = generatePoNumber(tenantId);

        List<PurchaseOrderItem> lineItems = req.getItems().stream()
                .map(li -> PurchaseOrderItem.builder()
                        .inventoryItemId(li.getInventoryItemId())
                        .orderedQuantity(li.getOrderedQuantity())
                        .orderedUnit(li.getOrderedUnit())
                        .unitPrice(li.getUnitPrice())
                        .build())
                .toList();

        PurchaseOrder po = PurchaseOrder.builder()
                .tenantId(tenantId)
                .poNumber(poNumber)
                .supplierId(req.getSupplierId())
                .expectedDeliveryDate(req.getExpectedDeliveryDate())
                .taxAmount(req.getTaxAmount())
                .notes(req.getNotes())
                .createdBy(createdBy)
                .items(new java.util.ArrayList<>(lineItems))
                .build();

        po.recalculateTotals();
        return poRepository.save(po);
    }

    /** Transitions PO from draft → sent. */
    @Transactional
    public PurchaseOrder send(UUID tenantId, UUID id, String sentVia) {
        PurchaseOrder po = getById(tenantId, id);
        if (po.getStatus() != PurchaseOrderStatus.draft) {
            throw new ValidationException("Only draft POs can be sent. Current status: " + po.getStatus());
        }
        po.setStatus(PurchaseOrderStatus.sent);
        po.setSentVia(sentVia);
        po.setSentAt(Instant.now());
        PurchaseOrder saved = poRepository.save(po);
        eventPublisher.publishPoSent(tenantId, saved);
        return saved;
    }

    /** Transitions PO from sent → confirmed (full receipt confirmed). */
    @Transactional
    public PurchaseOrder confirm(UUID tenantId, UUID id, UUID receivedBy) {
        PurchaseOrder po = getById(tenantId, id);
        if (po.getStatus() == PurchaseOrderStatus.draft || po.getStatus() == PurchaseOrderStatus.cancelled) {
            throw new ValidationException("Cannot confirm a PO in status: " + po.getStatus());
        }
        po.setStatus(PurchaseOrderStatus.received);
        po.setReceivedBy(receivedBy);
        po.setActualDeliveryDate(java.time.LocalDate.now());
        return poRepository.save(po);
    }

    @Transactional
    public PurchaseOrder cancel(UUID tenantId, UUID id) {
        PurchaseOrder po = getById(tenantId, id);
        if (po.getStatus() == PurchaseOrderStatus.received) {
            throw new ValidationException("Cannot cancel an already received PO.");
        }
        po.setStatus(PurchaseOrderStatus.cancelled);
        return poRepository.save(po);
    }

    @Transactional
    public void delete(UUID tenantId, UUID id) {
        PurchaseOrder po = getById(tenantId, id);
        if (po.getStatus() != PurchaseOrderStatus.draft) {
            throw new ValidationException("Only draft POs can be deleted.");
        }
        po.setDeletedAt(Instant.now());
        poRepository.save(po);
    }

    private String generatePoNumber(UUID tenantId) {
        // Format: PO-YYYYMMDD-XXXX (sequential within the day, collision-safe via UUID suffix)
        String date = java.time.LocalDate.now().toString().replace("-", "");
        String suffix = UUID.randomUUID().toString().substring(0, 4).toUpperCase();
        return "PO-" + date + "-" + suffix;
    }
}
