package com.kitchenledger.staff.model;

import com.kitchenledger.staff.model.enums.ShiftSwapStatus;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "shift_swaps")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ShiftSwap {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "requesting_employee_id", nullable = false)
    private UUID requestingEmployeeId;

    @Column(name = "target_employee_id", nullable = false)
    private UUID targetEmployeeId;

    @Column(name = "original_shift_id", nullable = false)
    private UUID originalShiftId;

    @Column(name = "target_shift_id")
    private UUID targetShiftId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    @Builder.Default
    private ShiftSwapStatus status = ShiftSwapStatus.PENDING;

    @Column(name = "request_reason")
    private String requestReason;

    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
