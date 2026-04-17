package com.kitchenledger.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kitchenledger.auth.util.TestKeyPairFactory;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Base class for all Auth Service integration tests.
 *
 * Starts PostgreSQL 16, RabbitMQ 3.13, and Redis 7 via Testcontainers.
 * Containers are shared across all subclasses (static fields + @Testcontainers).
 * RSA keys from TestKeyPairFactory are injected via @DynamicPropertySource.
 *
 * Auth flow: tests simulate the API Gateway by sending x-user-id,
 * x-tenant-id, and x-user-role headers directly to the service.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@Testcontainers
public abstract class AbstractIT {

    // ── Containers ────────────────────────────────────────────────────────────

    @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("kitchenledger")
                    .withUsername("kl_user")
                    .withPassword("kl_password");

    @Container
    static final RabbitMQContainer RABBITMQ =
            new RabbitMQContainer("rabbitmq:3.13-alpine");

    @Container
    @SuppressWarnings("resource")
    static final GenericContainer<?> REDIS =
            new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);

    // ── Dynamic properties ────────────────────────────────────────────────────

    @DynamicPropertySource
    static void registerProperties(DynamicPropertyRegistry registry) {
        // Database
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);

        // RabbitMQ (uses default guest/guest from the testcontainers image)
        registry.add("spring.rabbitmq.host", RABBITMQ::getHost);
        registry.add("spring.rabbitmq.port", RABBITMQ::getAmqpPort);
        registry.add("spring.rabbitmq.username", RABBITMQ::getAdminUsername);
        registry.add("spring.rabbitmq.password", RABBITMQ::getAdminPassword);

        // Redis
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));

        // RSA key pair (generated once per JVM — fast, real keys)
        registry.add("jwt.private-key", TestKeyPairFactory::privatePem);
        registry.add("jwt.public-key", TestKeyPairFactory::publicPem);

        // Shared secret for /internal/* endpoints
        registry.add("internal.service.secret", () -> "test-internal-secret-abc123");

        // Shorten token expiry for faster tests
        registry.add("jwt.access-token-expiry-minutes", () -> "5");
        registry.add("jwt.refresh-token-expiry-days", () -> "1");
    }

    // ── Shared test infrastructure ────────────────────────────────────────────

    @Autowired
    private WebApplicationContext wac;

    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;

    @BeforeEach
    void initMockMvc() {
        this.mockMvc = MockMvcBuilders.webAppContextSetup(this.wac)
                .apply(springSecurity())
                .build();
    }

    protected static final String INTERNAL_SECRET = "test-internal-secret-abc123";

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Unique email per test to avoid UNIQUE constraint conflicts without DB cleanup. */
    protected static String uniqueEmail(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8) + "@test.com";
    }

    /** JSON body helper. */
    protected String json(Object obj) throws Exception {
        return objectMapper.writeValueAsString(obj);
    }

    /**
     * Register a new tenant+owner and return the parsed auth response payload.
     * Used as setup in tests that need an existing account.
     */
    protected Map<String, Object> registerAndGetData(String email, String password) throws Exception {
        Map<String, Object> req = Map.of(
                "restaurantName", "Test Restaurant",
                "email", email,
                "password", password,
                "fullName", "Test Owner"
        );

        MvcResult result = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(req)))
                .andExpect(status().isCreated())
                .andReturn();

        //noinspection unchecked
        Map<String, Object> body = objectMapper.readValue(
                result.getResponse().getContentAsString(), Map.class);
        //noinspection unchecked
        return (Map<String, Object>) body.get("data");
    }

    /**
     * Login and return the parsed auth response payload.
     */
    protected Map<String, Object> loginAndGetData(String email, String password) throws Exception {
        Map<String, Object> req = Map.of("email", email, "password", password);

        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(req)))
                .andExpect(status().isOk())
                .andReturn();

        //noinspection unchecked
        Map<String, Object> body = objectMapper.readValue(
                result.getResponse().getContentAsString(), Map.class);
        //noinspection unchecked
        return (Map<String, Object>) body.get("data");
    }
}
