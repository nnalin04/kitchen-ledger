package com.kitchenledger.inventory;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kitchenledger.inventory.util.TestKeyPairFactory;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;

/**
 * Base class for all Inventory Service integration tests.
 *
 * Starts PostgreSQL 16, RabbitMQ 3.13, and Redis 7 via Testcontainers.
 * Containers are shared across all subclasses (static fields + @Testcontainers).
 * RSA keys from TestKeyPairFactory are injected via @DynamicPropertySource.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@Testcontainers
public abstract class AbstractIT {

    // ── Containers ────────────────────────────────────────────────────────────

    @Container
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("kitchenledger_inventory")
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

        // RabbitMQ
        registry.add("spring.rabbitmq.host", RABBITMQ::getHost);
        registry.add("spring.rabbitmq.port", RABBITMQ::getAmqpPort);
        registry.add("spring.rabbitmq.username", RABBITMQ::getAdminUsername);
        registry.add("spring.rabbitmq.password", RABBITMQ::getAdminPassword);

        // Redis
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));

        // RSA key pair (shared for validation fake-token signing)
        registry.add("jwt.public-key", TestKeyPairFactory::publicPem);

        // Shorten token expiry for faster tests
        registry.add("jwt.access-token-expiry-minutes", () -> "5");
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

    /** JSON body helper. */
    protected String json(Object obj) throws Exception {
        return objectMapper.writeValueAsString(obj);
    }
}
