package com.kitchenledger.finance.service;

import com.kitchenledger.finance.dto.request.CreateExpenseRequest;
import com.kitchenledger.finance.event.FinanceEventPublisher;
import com.kitchenledger.finance.exception.ResourceNotFoundException;
import com.kitchenledger.finance.model.Expense;
import com.kitchenledger.finance.model.enums.PaymentMethod;
import com.kitchenledger.finance.repository.ExpenseRepository;
import com.kitchenledger.finance.repository.VendorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ExpenseService {

    private final ExpenseRepository expenseRepository;
    private final VendorRepository vendorRepository;
    private final FinanceEventPublisher eventPublisher;

    @Transactional(readOnly = true)
    public Page<Expense> list(UUID tenantId, String category, LocalDate from, LocalDate to,
                               Pageable pageable) {
        boolean hasDateRange = from != null && to != null;
        boolean hasCategory  = category != null && !category.isBlank();

        if (hasDateRange && hasCategory) {
            return expenseRepository
                    .findByTenantIdAndCategoryAndExpenseDateBetweenAndDeletedAtIsNullOrderByExpenseDateDesc(
                            tenantId, category, from, to, pageable);
        }
        if (hasDateRange) {
            return expenseRepository
                    .findByTenantIdAndExpenseDateBetweenAndDeletedAtIsNullOrderByExpenseDateDesc(
                            tenantId, from, to, pageable);
        }
        if (hasCategory) {
            return expenseRepository
                    .findByTenantIdAndCategoryAndDeletedAtIsNullOrderByExpenseDateDesc(
                            tenantId, category, pageable);
        }
        return expenseRepository.findByTenantIdAndDeletedAtIsNullOrderByExpenseDateDesc(
                tenantId, pageable);
    }

    @Transactional(readOnly = true)
    public Expense getById(UUID tenantId, UUID id) {
        return expenseRepository.findByIdAndTenantIdAndDeletedAtIsNull(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Expense not found: " + id));
    }

    @Transactional(readOnly = true)
    public BigDecimal totalAmount(UUID tenantId, LocalDate from, LocalDate to) {
        return expenseRepository.sumAmountBetween(tenantId, from, to);
    }

    @Transactional(readOnly = true)
    public BigDecimal totalByCategory(UUID tenantId, String category, LocalDate from, LocalDate to) {
        return expenseRepository.sumAmountByCategoryBetween(tenantId, category, from, to);
    }

    @Transactional
    public Expense create(UUID tenantId, UUID createdBy, CreateExpenseRequest req) {
        Expense expense = Expense.builder()
                .tenantId(tenantId)
                .expenseDate(req.getExpenseDate())
                .category(req.getCategory())
                .description(req.getDescription())
                .amount(req.getAmount())
                .vendorId(req.getVendorId())
                .paymentMethod(req.getPaymentMethod())
                .referenceNumber(req.getReferenceNumber())
                .receiptUrl(req.getReceiptUrl())
                .recurring(req.isRecurring())
                .accountId(req.getAccountId())
                .createdBy(createdBy)
                .build();
        Expense saved = expenseRepository.save(expense);
        eventPublisher.publishExpenseCreated(tenantId, saved);
        return saved;
    }

    /**
     * Creates an expense from OCR extraction results.
     * Uses a nil UUID as createdBy (system-initiated) since no user context is available.
     * The [OCR] prefix in description lets staff identify and review auto-created entries.
     */
    @Transactional
    public void createFromOcr(UUID tenantId, UUID initiatedBy, Map<String, Object> ocrPayload) {
        @SuppressWarnings("unchecked")
        Map<String, Object> result = (Map<String, Object>) ocrPayload.get("result");
        if (result == null) {
            log.warn("ExpenseService.createFromOcr: no 'result' key in OCR payload, skipping");
            return;
        }

        String dateStr = (String) result.get("date");
        LocalDate expenseDate;
        try {
            expenseDate = dateStr != null ? LocalDate.parse(dateStr) : LocalDate.now();
        } catch (Exception e) {
            expenseDate = LocalDate.now();
        }

        BigDecimal amount;
        try {
            amount = new BigDecimal(String.valueOf(result.getOrDefault("total_amount", "0")));
        } catch (NumberFormatException e) {
            amount = BigDecimal.ZERO;
        }

        String vendorName = (String) result.getOrDefault("vendor_name", "Unknown vendor");

        CreateExpenseRequest req = new CreateExpenseRequest();
        req.setExpenseDate(expenseDate);
        req.setCategory((String) result.getOrDefault("category", "other"));
        req.setDescription("[OCR] " + vendorName);
        req.setAmount(amount.compareTo(BigDecimal.ZERO) > 0 ? amount : BigDecimal.ONE); // amount must be positive
        req.setReceiptUrl((String) result.get("file_url"));
        req.setPaymentMethod(PaymentMethod.cash);

        // initiatedBy is null when ai-service doesn't supply a user context — allowed by DB
        create(tenantId, initiatedBy, req);
        log.info("ExpenseService.createFromOcr: created expense for tenant {} from OCR (vendor: {})", tenantId, vendorName);
    }

    /**
     * Updates an existing expense with fields extracted from an OCR result.
     * Called when ai.ocr.completed carries a reference_id pointing to an existing expense.
     * Fields updated: amount, vendor_id (fuzzy-matched by name), receipt_url, description.
     * The "[OCR Updated]" prefix marks the entry for staff review.
     */
    @Transactional
    public void updateFromOcr(UUID tenantId, UUID expenseId, Map<String, Object> ocrPayload) {
        expenseRepository.findByIdAndTenantIdAndDeletedAtIsNull(expenseId, tenantId).ifPresentOrElse(expense -> {
            @SuppressWarnings("unchecked")
            Map<String, Object> result = (Map<String, Object>) ocrPayload.get("result");
            if (result == null) {
                log.warn("ExpenseService.updateFromOcr: no 'result' key in OCR payload for expense {}, skipping", expenseId);
                return;
            }

            // Update amount if present and valid
            String amountStr = String.valueOf(result.get("total_amount"));
            if (result.containsKey("total_amount") && !"null".equals(amountStr)) {
                try {
                    BigDecimal amount = new BigDecimal(amountStr);
                    if (amount.compareTo(BigDecimal.ZERO) > 0) {
                        expense.setAmount(amount);
                    }
                } catch (NumberFormatException e) {
                    log.warn("ExpenseService.updateFromOcr: invalid total_amount '{}' for expense {}", amountStr, expenseId);
                }
            }

            // Fuzzy-match vendor by name
            String vendorName = (String) result.get("vendor_name");
            if (vendorName != null && !vendorName.isBlank()) {
                vendorRepository.findByTenantIdAndNameContainingIgnoreCaseAndDeletedAtIsNull(tenantId, vendorName)
                        .stream().findFirst()
                        .ifPresent(v -> expense.setVendorId(v.getId()));
            }

            // Update receipt URL if present
            String fileUrl = (String) result.get("file_url");
            if (fileUrl != null && !fileUrl.isBlank()) {
                expense.setReceiptUrl(fileUrl);
            }

            // Prefix description to indicate OCR update for staff review
            if (!expense.getDescription().startsWith("[OCR Updated]")) {
                expense.setDescription("[OCR Updated] " + expense.getDescription());
            }

            expenseRepository.save(expense);
            log.info("ExpenseService.updateFromOcr: updated expense {} for tenant {} from OCR", expenseId, tenantId);
        }, () -> log.warn("ExpenseService.updateFromOcr: expense {} not found for tenant {}, skipping", expenseId, tenantId));
    }

    @Transactional
    public Expense update(UUID tenantId, UUID id, CreateExpenseRequest req) {
        Expense expense = getById(tenantId, id);
        expense.setExpenseDate(req.getExpenseDate());
        expense.setCategory(req.getCategory());
        expense.setDescription(req.getDescription());
        expense.setAmount(req.getAmount());
        expense.setVendorId(req.getVendorId());
        expense.setPaymentMethod(req.getPaymentMethod());
        expense.setReferenceNumber(req.getReferenceNumber());
        expense.setReceiptUrl(req.getReceiptUrl());
        expense.setRecurring(req.isRecurring());
        expense.setAccountId(req.getAccountId());
        return expenseRepository.save(expense);
    }

    @Transactional
    public void delete(UUID tenantId, UUID id) {
        Expense expense = getById(tenantId, id);
        expense.setDeletedAt(Instant.now());
        expenseRepository.save(expense);
    }
}
