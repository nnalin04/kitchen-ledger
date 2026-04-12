package com.kitchenledger.auth.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class AuthResponse {

    private String accessToken;
    private String refreshToken;
    private long expiresIn; // seconds until access token expiry
    private UserResponse user;
    private TenantResponse tenant;
}
