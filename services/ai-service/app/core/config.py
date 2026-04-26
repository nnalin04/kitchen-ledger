from pydantic_settings import BaseSettings
from pydantic import ConfigDict, field_validator


class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env", case_sensitive=False)

    # Server
    port: int = 8084
    debug: bool = False

    # Database
    database_url: str = "postgresql://ai:ai@localhost:5432/ai_service"

    # Redis
    redis_url: str = "redis://redis:6379/0"
    redis_result_url: str = "redis://redis:6379/1"

    # RabbitMQ
    rabbitmq_url: str = "amqp://kl_rabbit:kl_rabbit_pass@localhost:5672"

    # AI providers
    openai_api_key: str = ""
    google_cloud_credentials: str = ""  # path to GCP service account JSON
    mindee_api_key: str = ""

    # Internal service calls
    inventory_service_url: str = "http://inventory-service:8082"
    finance_service_url: str = "http://finance-service:8083"
    file_service_url: str = "http://file-service:8085"
    internal_service_secret: str

    @field_validator('internal_service_secret')
    @classmethod
    def must_be_set(cls, v: str) -> str:
        if not v:
            raise ValueError("INTERNAL_SERVICE_SECRET must be set")
        return v


settings = Settings()
