package com.kitchenledger.auth.service;

import com.kitchenledger.auth.dto.response.TenantResponse;
import com.kitchenledger.auth.exception.ResourceNotFoundException;
import com.kitchenledger.auth.model.Tenant;
import com.kitchenledger.auth.repository.TenantRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TenantServiceTest {

    @Mock TenantRepository tenantRepository;
    @InjectMocks TenantService tenantService;

    private Tenant tenant;

    @BeforeEach
    void setUp() {
        tenant = Tenant.builder()
                .id(UUID.randomUUID())
                .restaurantName("Spice Garden")
                .slug("spice-garden")
                .email("owner@spicegarden.com")
                .settings(new java.util.HashMap<>(Map.of("default_tax_rate", 5)))
                .build();
    }

    @Test
    void getById_existingTenant_returnsTenantResponse() {
        when(tenantRepository.findById(tenant.getId())).thenReturn(Optional.of(tenant));

        TenantResponse response = tenantService.getById(tenant.getId());

        assertThat(response.getId()).isEqualTo(tenant.getId());
        assertThat(response.getRestaurantName()).isEqualTo("Spice Garden");
    }

    @Test
    void getById_missingTenant_throwsNotFoundException() {
        UUID id = UUID.randomUUID();
        when(tenantRepository.findById(id)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> tenantService.getById(id))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void updateSettings_mergesWithExistingSettings() {
        when(tenantRepository.findById(tenant.getId())).thenReturn(Optional.of(tenant));
        when(tenantRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> newSettings = Map.of(
                "enable_upi", true,
                "default_tax_rate", 12  // override existing
        );
        Map<String, Object> result = tenantService.updateSettings(tenant.getId(), newSettings);

        assertThat(result).containsEntry("enable_upi", true);
        assertThat(result).containsEntry("default_tax_rate", 12);
    }

    @Test
    void completeOnboarding_setsOnboardingDoneTrue() {
        when(tenantRepository.findById(tenant.getId())).thenReturn(Optional.of(tenant));
        when(tenantRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        TenantResponse result = tenantService.completeOnboarding(tenant.getId());

        assertThat(result.isOnboardingDone()).isTrue();
    }

    @Test
    void updateProfile_updatesAllowedFields() {
        when(tenantRepository.findById(tenant.getId())).thenReturn(Optional.of(tenant));
        when(tenantRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> fields = Map.of(
                "restaurantName", "Spice Garden v2",
                "city", "Mumbai"
        );
        TenantResponse result = tenantService.updateProfile(tenant.getId(), fields);

        assertThat(result.getRestaurantName()).isEqualTo("Spice Garden v2");
    }
}
