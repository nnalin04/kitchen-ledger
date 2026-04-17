package com.kitchenledger.staff.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "attendance")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Attendance {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "employee_id", nullable = false)
    private UUID employeeId;

    @Column(name = "shift_id")
    private UUID shiftId;

    @Column(name = "clock_in_at", nullable = false)
    @Builder.Default
    private Instant clockInAt = Instant.now();

    @Column(name = "clock_out_at")
    private Instant clockOutAt;

    @Column(name = "hours_worked", precision = 5, scale = 2)
    private BigDecimal hoursWorked;

    @Column(name = "late_minutes", nullable = false)
    @Builder.Default
    private int lateMinutes = 0;

    @Column(name = "notes")
    private String notes;

    @Column(name = "recorded_by", nullable = false)
    private UUID recordedBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
