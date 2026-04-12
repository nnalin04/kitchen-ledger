from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Server
    port: int = 8084

    # Database
    database_url: str

    # Redis
    redis_url: str = "redis://localhost:6379"

    # RabbitMQ
    rabbitmq_url: str = "amqp://kl_rabbit:kl_rabbit_pass@localhost:5672"

    # AI providers
    openai_api_key: str = ""
    google_cloud_credentials: str = ""
    mindee_api_key: str = ""

    # Internal service calls
    inventory_service_url: str = "http://localhost:8082"
    finance_service_url: str = "http://localhost:8083"
    internal_service_secret: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
