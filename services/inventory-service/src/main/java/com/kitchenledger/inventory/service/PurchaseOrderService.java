package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.dto.request.CreatePurchaseOrderRequest;
import com.kitchenledger.inventory.dto.request.ReceiveLineItemRequest;
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

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

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

    /**
     * Partial or full receipt of a PO.
     * - Receives each line item up to its ordered quantity (over-receipt blocked).
     * - Transitions to `partial` if some lines are still outstanding.
     * - Transitions to `received` when all lines are fully received.
     * - Emits a status-change event.
     */
    @Transactional
    public PurchaseOrder receivePartial(UUID tenantId, UUID id, UUID receivedBy,
                                        List<ReceiveLineItemRequest> lineUpdates) {
        PurchaseOrder po = getById(tenantId, id);

        if (po.getStatus() == PurchaseOrderStatus.draft
                || po.getStatus() == PurchaseOrderStatus.cancelled
                || po.getStatus() == PurchaseOrderStatus.closed) {
            throw new ValidationException("Cannot receive a PO in status: " + po.getStatus());
        }

        PurchaseOrderStatus previousStatus = po.getStatus();

        Map<UUID, PurchaseOrderItem> itemById = po.getItems().stream()
                .collect(Collectors.toMap(PurchaseOrderItem::getId, Function.identity()));

        for (ReceiveLineItemRequest update : lineUpdates) {
            PurchaseOrderItem item = itemById.get(update.getLineItemId());
            if (item == null) {
                throw new ValidationException("Line item not found: " + update.getLineItemId());
            }
            BigDecimal newTotal = item.getReceivedQuantity().add(update.getReceivedQuantity());
            if (newTotal.compareTo(item.getOrderedQuantity()) > 0) {
                throw new ValidationException(
                        "Quantity would cause over-receipt for item " + item.getInventoryItemId()
                        + ": ordered=" + item.getOrderedQuantity() + " total-received=" + newTotal);
            }
            item.setReceivedQuantity(newTotal);
        }

        // Determine new status from line items
        boolean allReceived = po.getItems().stream().allMatch(
                item -> item.getReceivedQuantity().compareTo(item.getOrderedQuantity()) >= 0);
        boolean anyReceived = po.getItems().stream().anyMatch(
                item -> item.getReceivedQuantity().compareTo(BigDecimal.ZERO) > 0);

        PurchaseOrderStatus newStatus = allReceived
                ? PurchaseOrderStatus.received
                : (anyReceived ? PurchaseOrderStatus.partial : po.getStatus());

        if (newStatus == PurchaseOrderStatus.received || newStatus == PurchaseOrderStatus.partial) {
            po.setStatus(newStatus);
            if (newStatus == PurchaseOrderStatus.received) {
                po.setReceivedBy(receivedBy);
                po.setActualDeliveryDate(java.time.LocalDate.now());
            }
        }

        PurchaseOrder saved = poRepository.save(po);
        if (newStatus != previousStatus) {
            eventPublisher.publishPoStatusChanged(tenantId, saved, previousStatus, newStatus);
        }
        return saved;
    }

    /**
     * Closes a fully-received PO.
     * Partial POs cannot be closed without explicit acknowledgement (use forceClose = true path via API).
     */
    @Transactional
    public PurchaseOrder close(UUID tenantId, UUID id) {
        PurchaseOrder po = getById(tenantId, id);
        if (po.getStatus() == PurchaseOrderStatus.draft
                || po.getStatus() == PurchaseOrderStatus.sent
                || po.getStatus() == PurchaseOrderStatus.cancelled
                || po.getStatus() == PurchaseOrderStatus.closed) {
            throw new ValidationException("Cannot close a PO in status: " + po.getStatus());
        }
        if (po.getStatus() == PurchaseOrderStatus.partial) {
            throw new ValidationException(
                    "PO is only partially received. Receive all outstanding items before closing.");
        }
        PurchaseOrderStatus previous = po.getStatus();
        po.setStatus(PurchaseOrderStatus.closed);
        PurchaseOrder saved = poRepository.save(po);
        eventPublisher.publishPoStatusChanged(tenantId, saved, previous, PurchaseOrderStatus.closed);
        return saved;
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
        String date = java.time.LocalDate.now().toString().replace("-", "");
        for (int attempt = 0; attempt < 5; attempt++) {
            String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 8).toUpperCase();
            String candidate = "PO-" + date + "-" + suffix;
            if (!poRepository.existsByTenantIdAndPoNumber(tenantId, candidate)) {
                return candidate;
            }
        }
        throw new IllegalStateException("Could not generate a unique PO number after 5 attempts");
    }
}
