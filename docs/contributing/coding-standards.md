# Coding Standards

To maintain a high-quality codebase, we adhere to strict standards.

## Rust (Core Chain)

*   **Style**: Follow standard Rust formatting (`cargo fmt`).
*   **Safety**: Avoid `unsafe` blocks unless absolutely necessary and documented with a `// SAFETY:` comment explaining why it is safe.
*   **Error Handling**: Use `Result` types. Do not use `unwrap()` in production code.
*   **Testing**: All public functions must have unit tests.

## TypeScript (SDK/Frontend)

*   **Linter**: ESLint with Prettier.
*   **Types**: No `any`. Use strict typing.
*   **Async**: Use `async/await` instead of `.then()` chains.
