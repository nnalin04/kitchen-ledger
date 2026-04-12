package com.kitchenledger.auth.service;

import com.kitchenledger.auth.dto.response.TenantResponse;
import com.kitchenledger.auth.exception.ResourceNotFoundException;
import com.kitchenledger.auth.model.Tenant;
import com.kitchenledger.auth.repository.TenantRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TenantService {

    private final TenantRepository tenantRepository;

    @Transactional(readOnly = true)
    public TenantResponse getById(UUID tenantId) {
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Tenant", tenantId));
        return TenantResponse.from(tenant);
    }

    @Transactional
    public TenantResponse updateProfile(UUID tenantId, Map<String, Object> fields) {
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Tenant", tenantId));

        if (fields.containsKey("restaurantName"))
            tenant.setRestaurantName((String) fields.get("restaurantName"));
        if (fields.containsKey("phone"))
            tenant.setPhone((String) fields.get("phone"));
        if (fields.containsKey("timezone"))
            tenant.setTimezone((String) fields.get("timezone"));
        if (fields.containsKey("addressLine1"))
            tenant.setAddressLine1((String) fields.get("addressLine1"));
        if (fields.containsKey("addressLine2"))
            tenant.setAddressLine2((String) fields.get("addressLine2"));
        if (fields.containsKey("city"))
            tenant.setCity((String) fields.get("city"));
        if (fields.containsKey("state"))
            tenant.setState((String) fields.get("state"));
        if (fields.containsKey("postalCode"))
            tenant.setPostalCode((String) fields.get("postalCode"));

        return TenantResponse.from(tenantRepository.save(tenant));
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getSettings(UUID tenantId) {
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Tenant", tenantId));
        return tenant.getSettings();
    }

    @Transactional
    public TenantResponse completeOnboarding(UUID tenantId) {
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Tenant", tenantId));
        tenant.setOnboardingDone(true);
        return TenantResponse.from(tenantRepository.save(tenant));
    }

    @Transactional
    public Map<String, Object> updateSettings(UUID tenantId, Map<String, Object> newSettings) {
        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Tenant", tenantId));

        // Merge — only update provided keys, keep existing ones
        Map<String, Object> merged = new java.util.HashMap<>(tenant.getSettings());
        merged.putAll(newSettings);
        tenant.setSettings(merged);

        return tenantRepository.save(tenant).getSettings();
    }
}
