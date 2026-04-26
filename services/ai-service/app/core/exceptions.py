"""
Common application exception classes.
Extracted from main.py to avoid circular imports between routers and main.
"""


class ServiceException(Exception):
    def __init__(self, code: str, message: str, status: int = 400):
        self.code = code
        self.message = message
        self.status = status


class NotFoundException(ServiceException):
    def __init__(self, message: str):
        super().__init__("NOT_FOUND", message, 404)


class AccessDeniedException(ServiceException):
    def __init__(self, message: str):
        super().__init__("FORBIDDEN", message, 403)
