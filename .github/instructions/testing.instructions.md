---
description: "Use when writing test files for this project. Covers test patterns, naming conventions, and TDD approach."
applyTo: "api/**/*.test.ts"
---
# Testing Conventions

## Framework
- Use Jest or Vitest (whichever is configured in the project)
- TypeScript test files co-located with source: `functionName.test.ts`

## Test Structure
```typescript
describe('functionName', () => {
  describe('happy path', () => {
    it('should return 201 with full document on valid input', async () => { ... });
  });
  describe('validation', () => {
    it('should return 400 when company is missing', async () => { ... });
    it('should return 400 when dateApplied is in the future', async () => { ... });
  });
  describe('not found', () => {
    it('should return 404 for non-existent ID', async () => { ... });
  });
  describe('business rules', () => {
    it('should auto-update status to Interview Stage on first interview', async () => { ... });
  });
});
```

## Naming
- Test names describe behaviour: "should return 400 when company is missing"
- Group by category: happy path, validation, not found, business rules, edge cases

## Assertions
- Always check: status code, response shape (`{ data, error }`), field values
- For errors: verify `error.code`, `error.message`, and `error.details` array
- For success: verify all expected fields are present and correctly typed

## Mocking
- Mock Cosmos DB client for unit tests
- Mock Blob Storage SDK for file operation tests
- Do NOT mock validation logic — test it end-to-end through the function
