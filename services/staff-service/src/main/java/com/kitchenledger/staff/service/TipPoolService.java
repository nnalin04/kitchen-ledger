package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.CreateTipPoolRequest;
import com.kitchenledger.staff.event.StaffEventPublisher;
import com.kitchenledger.staff.exception.ConflictException;
import com.kitchenledger.staff.exception.ResourceNotFoundException;
import com.kitchenledger.staff.exception.ValidationException;
import com.kitchenledger.staff.model.Attendance;
import com.kitchenledger.staff.model.Employee;
import com.kitchenledger.staff.model.TipPool;
import com.kitchenledger.staff.model.TipPoolDistribution;
import com.kitchenledger.staff.repository.AttendanceRepository;
import com.kitchenledger.staff.repository.EmployeeRepository;
import com.kitchenledger.staff.repository.TipPoolDistributionRepository;
import com.kitchenledger.staff.repository.TipPoolRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TipPoolService {

    private final TipPoolRepository tipPoolRepository;
    private final TipPoolDistributionRepository distributionRepository;
    private final EmployeeRepository employeeRepository;
    private final AttendanceRepository attendanceRepository;
    private final StaffEventPublisher eventPublisher;

    @Transactional(readOnly = true)
    public Page<TipPool> list(UUID tenantId, Pageable pageable) {
        return tipPoolRepository.findByTenantIdOrderByPoolDateDesc(tenantId, pageable);
    }

    @Transactional(readOnly = true)
    public TipPool getById(UUID tenantId, UUID id) {
        return tipPoolRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Tip pool not found: " + id));
    }

    @Transactional
    public TipPool create(UUID tenantId, UUID createdBy, CreateTipPoolRequest req) {
        if (tipPoolRepository.findByTenantIdAndPoolDate(tenantId, req.getPoolDate()).isPresent()) {
            throw new ConflictException("Tip pool already exists for date: " + req.getPoolDate());
        }
        TipPool pool = TipPool.builder()
                .tenantId(tenantId)
                .poolDate(req.getPoolDate())
                .totalAmount(req.getTotalAmount())
                .distributionMethod(req.getDistributionMethod())
                .notes(req.getNotes())
                .createdBy(createdBy)
                .build();
        return tipPoolRepository.save(pool);
    }

    /**
     * Distributes the tip pool among all active employees of the tenant.
     * Distribution strategy is determined by {@code pool.distributionMethod}:
     * <ul>
     *   <li>{@code BY_HOURS}  — proportional to attendance hours on pool date</li>
     *   <li>{@code BY_ROLE}   — equal share per role, then equal within role</li>
     *   <li>{@code BY_POINTS} — 1 point per employee (falls back to equal)</li>
     *   <li>{@code EQUAL} / null / anything else — equal split</li>
     * </ul>
     * Idempotent: any previous distribution rows for this pool are deleted before saving
     * the new calculation. The sum of all payouts is guaranteed to equal pool.totalAmount.
     */
    @Transactional
    public TipPool distribute(UUID tenantId, UUID id) {
        TipPool pool = getById(tenantId, id);
        if (pool.isDistributed()) {
            throw new ConflictException("Tip pool already distributed.");
        }

        List<Employee> employees = employeeRepository
                .findByTenantIdAndActiveTrueAndDeletedAtIsNull(tenantId);
        if (employees.isEmpty()) {
            throw new ValidationException("Cannot distribute: no eligible employees for tenant " + tenantId);
        }

        String method = pool.getDistributionMethod() != null
                ? pool.getDistributionMethod().toUpperCase()
                : "EQUAL";

        List<TipPoolDistribution> payouts = switch (method) {
            case "BY_HOURS"  -> distributeByHours(tenantId, pool, employees);
            case "BY_ROLE"   -> distributeByRole(pool, employees);
            case "BY_POINTS" -> distributeByPoints(pool, employees);
            default          -> distributeEqually(pool, employees);
        };

        // Idempotent recalculate: delete any prior rows for this pool
        distributionRepository.deleteByTipPoolId(pool.getId());
        distributionRepository.saveAll(payouts);

        Instant now = Instant.now();
        pool.setDistributed(true);
        pool.setDistributedAt(now);
        TipPool saved = tipPoolRepository.save(pool);
        eventPublisher.publishTipDistributed(tenantId, pool.getId(), pool.getTotalAmount());
        return saved;
    }

    // ── Distribution strategies ────────────────────────────────────────────────

    /**
     * Proportional to hours worked in attendance records on the pool date.
     * Falls back to equal split if no attendance records exist for that date.
     */
    private List<TipPoolDistribution> distributeByHours(UUID tenantId, TipPool pool,
                                                         List<Employee> employees) {
        Instant dayStart = pool.getPoolDate().atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant dayEnd   = pool.getPoolDate().plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();

        List<Attendance> records = attendanceRepository.findByTenantIdAndDate(tenantId, dayStart, dayEnd);

        // Build map: employeeId → total hours worked that day
        Map<UUID, BigDecimal> hoursMap = new LinkedHashMap<>();
        for (Attendance att : records) {
            hoursMap.merge(att.getEmployeeId(), att.getHoursWorked(), BigDecimal::add);
        }

        // Only include employees that actually have attendance records
        List<Employee> eligible = employees.stream()
                .filter(e -> hoursMap.containsKey(e.getId()))
                .collect(Collectors.toList());

        if (eligible.isEmpty()) {
            // No attendance records for this date → fall back to equal split
            return distributeEqually(pool, employees);
        }

        BigDecimal totalHours = hoursMap.values().stream()
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        if (totalHours.compareTo(BigDecimal.ZERO) == 0) {
            return distributeEqually(pool, employees);
        }

        Instant now = Instant.now();
        List<TipPoolDistribution> result = new ArrayList<>();
        BigDecimal allocated = BigDecimal.ZERO;

        for (int i = 0; i < eligible.size(); i++) {
            Employee emp = eligible.get(i);
            BigDecimal amount;
            if (i == eligible.size() - 1) {
                // Last employee absorbs rounding remainder so sum == totalAmount
                amount = pool.getTotalAmount().subtract(allocated);
            } else {
                BigDecimal hours = hoursMap.get(emp.getId());
                amount = pool.getTotalAmount()
                        .multiply(hours)
                        .divide(totalHours, 2, RoundingMode.HALF_UP);
                allocated = allocated.add(amount);
            }
            result.add(buildDistribution(pool.getTenantId(), pool.getId(), emp.getId(), amount, now));
        }
        return result;
    }

    /**
     * Equal share per role, then equal within each role.
     * e.g., 2 servers + 1 bartender: each server gets 25%, bartender gets 50%.
     */
    private List<TipPoolDistribution> distributeByRole(TipPool pool, List<Employee> employees) {
        // Group employees by role (null role treated as "unassigned")
        Map<String, List<Employee>> byRole = employees.stream()
                .collect(Collectors.groupingBy(
                        e -> e.getRole() != null ? e.getRole() : "unassigned",
                        LinkedHashMap::new,
                        Collectors.toList()));

        int numRoles = byRole.size();
        if (numRoles == 0) {
            return distributeEqually(pool, employees);
        }

        Instant now = Instant.now();
        List<TipPoolDistribution> result = new ArrayList<>();
        BigDecimal allocated = BigDecimal.ZERO;

        List<Map.Entry<String, List<Employee>>> roleEntries = new ArrayList<>(byRole.entrySet());
        for (int ri = 0; ri < roleEntries.size(); ri++) {
            List<Employee> roleEmployees = roleEntries.get(ri).getValue();
            // Share allocated to this role
            BigDecimal roleShare;
            if (ri == roleEntries.size() - 1) {
                // Last role absorbs any pool-level rounding remainder
                roleShare = pool.getTotalAmount().subtract(allocated);
            } else {
                roleShare = pool.getTotalAmount()
                        .divide(BigDecimal.valueOf(numRoles), 2, RoundingMode.HALF_UP);
                allocated = allocated.add(roleShare);
            }

            // Within role: equal split, remainder to last employee in this role
            BigDecimal roleAllocated = BigDecimal.ZERO;
            for (int ei = 0; ei < roleEmployees.size(); ei++) {
                BigDecimal amount;
                if (ei == roleEmployees.size() - 1) {
                    amount = roleShare.subtract(roleAllocated);
                } else {
                    amount = roleShare.divide(
                            BigDecimal.valueOf(roleEmployees.size()), 2, RoundingMode.HALF_UP);
                    roleAllocated = roleAllocated.add(amount);
                }
                result.add(buildDistribution(
                        pool.getTenantId(), pool.getId(),
                        roleEmployees.get(ei).getId(), amount, now));
            }
        }
        return result;
    }

    /**
     * 1 point per employee → same as equal split.
     * Future: points could come from pool distributionRules JSONB.
     */
    private List<TipPoolDistribution> distributeByPoints(TipPool pool, List<Employee> employees) {
        return distributeEqually(pool, employees);
    }

    /**
     * Equal split. Rounding remainder (if any) assigned to the last employee so
     * the sum is guaranteed to equal pool.totalAmount.
     */
    private List<TipPoolDistribution> distributeEqually(TipPool pool, List<Employee> employees) {
        int count = employees.size();
        BigDecimal share = pool.getTotalAmount().divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP);
        BigDecimal allocated = share.multiply(BigDecimal.valueOf(count - 1));

        Instant now = Instant.now();
        List<TipPoolDistribution> result = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            BigDecimal amount = (i == count - 1)
                    ? pool.getTotalAmount().subtract(allocated)
                    : share;
            result.add(buildDistribution(
                    pool.getTenantId(), pool.getId(), employees.get(i).getId(), amount, now));
        }
        return result;
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private TipPoolDistribution buildDistribution(UUID tenantId, UUID tipPoolId,
                                                   UUID employeeId, BigDecimal amount,
                                                   Instant distributedAt) {
        return TipPoolDistribution.builder()
                .tenantId(tenantId)
                .tipPoolId(tipPoolId)
                .employeeId(employeeId)
                .amount(amount)
                .distributedAt(distributedAt)
                .build();
    }
}
