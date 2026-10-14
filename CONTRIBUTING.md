# Contributing

Use Node 24.15+ within Node 24 and `npm ci`. Read `plan.md`, `IMPLEMENTATION.md`, and the architecture
documentation before changing behavior. Keep renderer logic separate from filesystem services.

Validate IPC inputs, retain native approval for changes, and use temporary synthetic files for tests.
Never weaken no-overwrite or root authorization checks to make a test pass. Add meaningful regression
tests for file-operation changes. Keep source formatted with Prettier and run:

```powershell
npm run check
npm run test:e2e
```

Document exact tested platforms. Do not claim real cross-volume or installer validation based only on
a mocked EXDEV test or configured target. Include known limitations with relevant changes.

Repository operations are performed by the project owner. Do not run Git commands on their behalf
without a new explicit instruction overriding the standing restriction.
