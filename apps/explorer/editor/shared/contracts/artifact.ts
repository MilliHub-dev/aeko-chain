export interface ProgramArtifactStatus {
  supported: boolean
  available: boolean
  fileName: string | null
  byteLength: number | null
  sha256: string | null
  builtAt: string | null
}
