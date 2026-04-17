package com.kitchenledger.finance.dto.response;

import com.kitchenledger.finance.model.DailySalesReport;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Data
@Builder
public class DsrResponse {

    private UUID id;
    private UUID tenantId;
    private LocalDate reportDate;
    private int coversCount;
    private BigDecimal grossSales;
    private BigDecimal discounts;
    private BigDecimal netSales;
    private BigDecimal cashSales;
    private BigDecimal upiSales;
    private BigDecimal cardSales;
    private BigDecimal otherSales;
    private BigDecimal vatCollected;
    private BigDecimal serviceChargeCollected;
    private BigDecimal costOfGoodsSold;
    private String notes;
    private boolean finalized;
    private UUID createdBy;
    private UUID approvedBy;
    private Instant finalizedAt;
    private Instant createdAt;
    private Instant updatedAt;

    public static DsrResponse from(DailySalesReport d) {
        return DsrResponse.builder()
                .id(d.getId())
                .tenantId(d.getTenantId())
                .reportDate(d.getReportDate())
                .coversCount(d.getCoversCount())
                .grossSales(d.getGrossSales())
                .discounts(d.getDiscounts())
                .netSales(d.getNetSales())
                .cashSales(d.getCashSales())
                .upiSales(d.getUpiSales())
                .cardSales(d.getCardSales())
                .otherSales(d.getOtherSales())
                .vatCollected(d.getVatCollected())
                .serviceChargeCollected(d.getServiceChargeCollected())
                .costOfGoodsSold(d.getCostOfGoodsSold())
                .notes(d.getNotes())
                .finalized(d.isFinalized())
                .createdBy(d.getCreatedBy())
                .approvedBy(d.getApprovedBy())
                .finalizedAt(d.getFinalizedAt())
                .createdAt(d.getCreatedAt())
                .updatedAt(d.getUpdatedAt())
                .build();
    }
}
