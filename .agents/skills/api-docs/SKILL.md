# /api-docs

Generate OpenAPI 3.0 documentation from the Spring Boot controllers. Optionally enable live Swagger UI.

## Usage
```
/api-docs [yaml|swagger-ui|both]
```
Default: `yaml` — generate `docs/openapi.yaml`.

## Mode: yaml — Generate OpenAPI spec

1. **Scan all controllers**: Glob `backend/src/main/java/com/healthcoach/**/*Controller.java`
2. **For each controller**, read and extract:
   - `@RequestMapping` base path
   - Each `@GetMapping`/`@PostMapping`/`@PutMapping`/`@DeleteMapping` + path + params
   - `@RequestBody` type → read the DTO class for fields
   - `@PathVariable` and `@RequestParam` names and types
   - Return type → read the response DTO for fields
   - HTTP status codes (look for `ResponseEntity<>` wrapping)
3. **Build `docs/openapi.yaml`** using OpenAPI 3.0 structure:
   ```yaml
   openapi: "3.0.3"
   info:
     title: Personal Health Coach API
     version: "1.0.0"
   servers:
     - url: https://healthcoach.duckdns.org/api
     - url: http://localhost:8080/api
   paths:
     /auth/login:
       post:
         summary: Authenticate user
         requestBody: ...
         responses:
           200: ...
           401: ...
   ```
4. **Write** the spec to `docs/openapi.yaml`
5. **Print a summary table**:
   ```
   Method | Path                     | Auth | Request Body     | Response
   -------|--------------------------|------|------------------|----------
   POST   | /auth/login              | No   | LoginRequest     | JwtResponse
   GET    | /users/me                | JWT  | —                | UserProfileResponse
   ...
   ```

## Mode: swagger-ui — Enable live Swagger UI at /swagger-ui.html

Add springdoc-openapi to the project:

1. **`backend/pom.xml`** — add dependency:
   ```xml
   <dependency>
     <groupId>org.springdoc</groupId>
     <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
     <version>2.3.0</version>
   </dependency>
   ```
2. **`backend/src/main/resources/application.yml`** — add:
   ```yaml
   springdoc:
     api-docs:
       path: /api-docs
     swagger-ui:
       path: /swagger-ui.html
       enabled: true
   ```
3. **`SecurityConfig.java`** — permit `/swagger-ui/**`, `/v3/api-docs/**`, `/api-docs` in the security filter chain.
4. Rebuild: `docker compose --env-file env.dev up -d --build --wait`
5. Verify: `curl http://localhost:8080/v3/api-docs | jq '.info'`
6. Open: `http://localhost:8080/swagger-ui.html`

## Mode: both
Run `yaml` first, then `swagger-ui`.

## Security note
Swagger UI should be disabled in prod (`springdoc.swagger-ui.enabled: false` in `application-prod.yml`) to avoid exposing API surface. The generated `docs/openapi.yaml` is the safe alternative for sharing.

## Learnings — nothing to report this run.
