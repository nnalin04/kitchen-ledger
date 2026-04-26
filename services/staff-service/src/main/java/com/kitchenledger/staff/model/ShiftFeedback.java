package com.kitchenledger.staff.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "shift_feedback")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ShiftFeedback {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "shift_id", nullable = false)
    private UUID shiftId;

    @Column(name = "employee_id", nullable = false)
    private UUID employeeId;

    @Column(name = "rating", nullable = false)
    private Integer rating;

    /** JSON array string stored as jsonb in Postgres. */
    @Column(name = "issues", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private String issues = "[]";

    /** JSON array string stored as jsonb in Postgres. */
    @Column(name = "equipment_flags", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private String equipmentFlags = "[]";

    @Column(name = "morale_note")
    private String moraleNote;

    @Column(name = "submitted_at", nullable = false, updatable = false)
    private Instant submittedAt;

    @PrePersist
    void onCreate() {
        if (submittedAt == null) submittedAt = Instant.now();
    }
}
