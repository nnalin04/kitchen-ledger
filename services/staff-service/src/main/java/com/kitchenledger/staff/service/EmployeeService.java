package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.CreateEmployeeRequest;
import com.kitchenledger.staff.event.StaffEventPublisher;
import com.kitchenledger.staff.exception.ResourceNotFoundException;
import com.kitchenledger.staff.model.Employee;
import com.kitchenledger.staff.repository.EmployeeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class EmployeeService {

    private final EmployeeRepository employeeRepository;
    private final StaffEventPublisher eventPublisher;

    @Transactional(readOnly = true)
    public List<Employee> listByTenant(UUID tenantId, boolean activeOnly) {
        return activeOnly
                ? employeeRepository.findByTenantIdAndActiveTrueAndDeletedAtIsNull(tenantId)
                : employeeRepository.findByTenantIdAndDeletedAtIsNullOrderByLastNameAsc(tenantId);
    }

    @Transactional(readOnly = true)
    public Employee getById(UUID tenantId, UUID id) {
        return employeeRepository.findByIdAndTenantIdAndDeletedAtIsNull(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Employee not found: " + id));
    }

    @Transactional
    public Employee create(UUID tenantId, CreateEmployeeRequest req) {
        Employee employee = Employee.builder()
                .tenantId(tenantId)
                .userId(req.getUserId())
                .firstName(req.getFirstName())
                .lastName(req.getLastName())
                .role(req.getRole())
                .employmentType(req.getEmploymentType())
                .hireDate(req.getHireDate())
                .hourlyRate(req.getHourlyRate())
                .monthlySalary(req.getMonthlySalary())
                .phone(req.getPhone())
                .emergencyContactName(req.getEmergencyContactName())
                .emergencyContactPhone(req.getEmergencyContactPhone())
                .notes(req.getNotes())
                .build();
        Employee saved = employeeRepository.save(employee);
        eventPublisher.publishEmployeeHired(tenantId, saved.getId(), saved.getFullName(), saved.getRole());
        return saved;
    }

    @Transactional
    public Employee update(UUID tenantId, UUID id, CreateEmployeeRequest req) {
        Employee employee = getById(tenantId, id);
        employee.setFirstName(req.getFirstName());
        employee.setLastName(req.getLastName());
        employee.setRole(req.getRole());
        employee.setEmploymentType(req.getEmploymentType());
        employee.setHireDate(req.getHireDate());
        employee.setHourlyRate(req.getHourlyRate());
        employee.setMonthlySalary(req.getMonthlySalary());
        employee.setPhone(req.getPhone());
        employee.setEmergencyContactName(req.getEmergencyContactName());
        employee.setEmergencyContactPhone(req.getEmergencyContactPhone());
        employee.setNotes(req.getNotes());
        if (req.getUserId() != null) employee.setUserId(req.getUserId());
        return employeeRepository.save(employee);
    }

    @Transactional
    public void terminate(UUID tenantId, UUID id) {
        Employee employee = getById(tenantId, id);
        employee.setActive(false);
        employee.setEndDate(java.time.LocalDate.now());
        employee.setDeletedAt(Instant.now());
        employeeRepository.save(employee);
    }
}
