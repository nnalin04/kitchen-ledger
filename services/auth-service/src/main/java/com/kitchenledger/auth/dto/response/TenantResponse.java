package com.kitchenledger.auth.dto.response;

import com.kitchenledger.auth.model.Tenant;
import com.kitchenledger.auth.model.enums.SubscriptionStatus;
import com.kitchenledger.auth.model.enums.SubscriptionTier;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Data
@Builder
public class TenantResponse {

    private UUID id;
    private String restaurantName;
    private String slug;
    private String email;
    private String phone;
    private String timezone;
    private String currency;
    private String locale;
    private SubscriptionTier subscriptionTier;
    private SubscriptionStatus subscriptionStatus;
    private Instant trialEndsAt;
    private Map<String, Object> settings;
    private int onboardingStep;
    private boolean onboardingDone;
    private Instant createdAt;

    public static TenantResponse from(Tenant tenant) {
        return TenantResponse.builder()
                .id(tenant.getId())
                .restaurantName(tenant.getRestaurantName())
                .slug(tenant.getSlug())
                .email(tenant.getEmail())
                .phone(tenant.getPhone())
                .timezone(tenant.getTimezone())
                .currency(tenant.getCurrency())
                .locale(tenant.getLocale())
                .subscriptionTier(tenant.getSubscriptionTier())
                .subscriptionStatus(tenant.getSubscriptionStatus())
                .trialEndsAt(tenant.getTrialEndsAt())
                .settings(tenant.getSettings())
                .onboardingStep(tenant.getOnboardingStep())
                .onboardingDone(tenant.isOnboardingDone())
                .createdAt(tenant.getCreatedAt())
                .build();
    }
}
