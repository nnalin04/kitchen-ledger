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
    sarvam_api_key: str = ""                 # Sarvam AI — voice ASR (Indian languages)
    google_cloud_credentials: str = ""       # Google Cloud Vision — image/handwriting OCR
    mindee_api_key: str = ""                 # Mindee — receipt/invoice OCR
    gemini_api_key: str = ""                 # Gemini Flash — optional LLM for structured parsing

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
