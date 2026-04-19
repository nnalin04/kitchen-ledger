package com.kitchenledger.inventory.service;

import com.kitchenledger.inventory.dto.CreateTransferRequest;
import com.kitchenledger.inventory.dto.StockTransferResponse;
import com.kitchenledger.inventory.dto.TransferItemRequest;
import com.kitchenledger.inventory.event.InventoryEventPublisher;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.InventoryMovement;
import com.kitchenledger.inventory.model.StockTransfer;
import com.kitchenledger.inventory.model.StockTransferItem;
import com.kitchenledger.inventory.model.enums.MovementType;
import com.kitchenledger.inventory.model.enums.TransferStatus;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.InventoryMovementRepository;
import com.kitchenledger.inventory.repository.StockTransferRepository;
import com.kitchenledger.inventory.security.TenantContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class StockTransferService {

    private final StockTransferRepository transferRepository;
    private final InventoryItemRepository itemRepository;
    private final InventoryMovementRepository movementRepository;
    private final InventoryEventPublisher eventPublisher;

    @Transactional
    public StockTransferResponse createTransfer(CreateTransferRequest request) {
        UUID tenantId = UUID.fromString(TenantContext.get());
        UUID userId = UUID.fromString(TenantContext.getUserId());

        StockTransfer transfer = StockTransfer.builder()
                .tenantId(tenantId)
                .fromLocation(request.getFromLocation())
                .toLocation(request.getToLocation())
                .status(TransferStatus.PENDING)
                .transferDate(LocalDate.now())
                .notes(request.getNotes())
                .transferredBy(userId)
                .build();

        for (TransferItemRequest itemReq : request.getItems()) {
            InventoryItem item = itemRepository.findByIdAndTenantId(itemReq.getInventoryItemId(), tenantId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Item not found: " + itemReq.getInventoryItemId()));

            StockTransferItem transferItem = StockTransferItem.builder()
                    .inventoryItem(item)
                    .quantity(itemReq.getQuantity())
                    .unit(item.getCountUnit())
                    .unitCost(item.getAvgCost())
                    .build();

            transfer.addItem(transferItem);
        }

        transfer = transferRepository.save(transfer);
        return mapToResponse(transfer);
    }

    @Transactional(readOnly = true)
    public Page<StockTransferResponse> getTransfers(Pageable pageable) {
        UUID tenantId = UUID.fromString(TenantContext.get());
        return transferRepository.findByTenantId(tenantId, pageable).map(this::mapToResponse);
    }

    @Transactional(readOnly = true)
    public StockTransferResponse getTransfer(UUID id) {
        return mapToResponse(getTransferEntity(id));
    }

    @Transactional
    public StockTransferResponse approveTransfer(UUID id) {
        StockTransfer transfer = getTransferEntity(id);
        if (transfer.getStatus() != TransferStatus.PENDING) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Transfer must be in PENDING status to be approved");
        }
        transfer.setStatus(TransferStatus.APPROVED);
        return mapToResponse(transferRepository.save(transfer));
    }

    @Transactional
    public StockTransferResponse completeTransfer(UUID id) {
        StockTransfer transfer = getTransferEntity(id);
        if (transfer.getStatus() != TransferStatus.APPROVED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Transfer must be in APPROVED status to be completed");
        }

        UUID tenantId    = UUID.fromString(TenantContext.get());
        UUID performedBy = UUID.fromString(TenantContext.getUserId());

        for (StockTransferItem transferItem : transfer.getItems()) {
            InventoryItem inventoryItem = transferItem.getInventoryItem();

            // Validate sufficient stock before deducting
            if (inventoryItem.getCurrentStock().compareTo(transferItem.getQuantity()) < 0) {
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                        "Insufficient stock for item '" + inventoryItem.getName()
                        + "': available=" + inventoryItem.getCurrentStock()
                        + ", requested=" + transferItem.getQuantity());
            }

            // Deduct from source inventory
            inventoryItem.setCurrentStock(
                    inventoryItem.getCurrentStock().subtract(transferItem.getQuantity()));
            itemRepository.save(inventoryItem);

            // Append-only movement ledger — TRANSFER_OUT
            movementRepository.save(InventoryMovement.builder()
                    .tenantId(tenantId)
                    .inventoryItemId(inventoryItem.getId())
                    .movementType(MovementType.transfer_out)
                    .quantityDelta(transferItem.getQuantity().negate())
                    .unit(transferItem.getUnit())
                    .unitCost(transferItem.getUnitCost())
                    .referenceId(transfer.getId())
                    .referenceType("STOCK_TRANSFER")
                    .notes("Transfer from " + transfer.getFromLocation() + " to " + transfer.getToLocation())
                    .performedBy(performedBy)
                    .build());

            // TRANSFER_IN movement (destination receives the stock)
            movementRepository.save(InventoryMovement.builder()
                    .tenantId(tenantId)
                    .inventoryItemId(inventoryItem.getId())
                    .movementType(MovementType.transfer_in)
                    .quantityDelta(transferItem.getQuantity())
                    .unit(transferItem.getUnit())
                    .unitCost(transferItem.getUnitCost())
                    .referenceId(transfer.getId())
                    .referenceType("STOCK_TRANSFER")
                    .notes("Transfer from " + transfer.getFromLocation() + " to " + transfer.getToLocation())
                    .performedBy(performedBy)
                    .build());

            // Fire low-stock alert if applicable after deduction
            if (inventoryItem.isBelowPar()) {
                eventPublisher.publishStockLow(tenantId, inventoryItem);
            }
        }

        transfer.setStatus(TransferStatus.COMPLETED);
        transfer.setCompletedAt(Instant.now());
        return mapToResponse(transferRepository.save(transfer));
    }

    @Transactional
    public StockTransferResponse cancelTransfer(UUID id) {
        StockTransfer transfer = getTransferEntity(id);
        if (transfer.getStatus() == TransferStatus.COMPLETED) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot cancel a COMPLETED transfer");
        }
        transfer.setStatus(TransferStatus.CANCELLED);
        return mapToResponse(transferRepository.save(transfer));
    }

    private StockTransfer getTransferEntity(UUID id) {
        UUID tenantId = UUID.fromString(TenantContext.get());
        return transferRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Stock transfer not found"));
    }

    private StockTransferResponse mapToResponse(StockTransfer transfer) {
        return StockTransferResponse.builder()
                .id(transfer.getId())
                .fromLocation(transfer.getFromLocation())
                .toLocation(transfer.getToLocation())
                .status(transfer.getStatus().getValue())
                .transferDate(transfer.getTransferDate())
                .notes(transfer.getNotes())
                .transferredBy(transfer.getTransferredBy())
                .completedAt(transfer.getCompletedAt())
                .build();
    }
}
