package com.kitchenledger.staff.dto.response;

import com.kitchenledger.staff.model.Certification;
import com.kitchenledger.staff.model.enums.CertificationStatus;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Data
@Builder
public class CertificationResponse {

    private UUID id;
    private UUID tenantId;
    private UUID employeeId;
    private String certName;
    private String certNumber;
    private String issuedBy;
    private LocalDate issuedDate;
    private LocalDate expiryDate;
    private String documentUrl;
    private CertificationStatus status;
    private Instant createdAt;

    public static CertificationResponse from(Certification c) {
        return CertificationResponse.builder()
                .id(c.getId())
                .tenantId(c.getTenantId())
                .employeeId(c.getEmployeeId())
                .certName(c.getCertName())
                .certNumber(c.getCertNumber())
                .issuedBy(c.getIssuedBy())
                .issuedDate(c.getIssuedDate())
                .expiryDate(c.getExpiryDate())
                .documentUrl(c.getDocumentUrl())
                .status(c.getStatus())
                .createdAt(c.getCreatedAt())
                .build();
    }
}
