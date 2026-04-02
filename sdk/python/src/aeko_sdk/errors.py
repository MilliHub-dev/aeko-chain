class AekoRpcError(Exception):
    """Raised when an AEKO RPC request returns an error payload."""

    def __init__(self, message: str, *, code: int | None = None, data: object | None = None):
        super().__init__(message)
        self.code = code
        self.data = data
