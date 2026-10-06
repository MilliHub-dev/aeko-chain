export interface ApiErrorPayload {
  code: string
  message: string
}

export interface ApiSuccess<T> {
  data: T
}

export interface ApiFailure {
  error: ApiErrorPayload
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure
