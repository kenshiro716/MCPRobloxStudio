# RanjiServer Script Testing Skill

Use this workflow whenever the user asks to test, validate, or debug a Roblox script.

## Testing rules

1. Read the target script first with `script_read`.
2. Inspect the target instance and its dependencies with `inspect_instance`.
3. Identify whether the code runs in Edit, Server, or Client context.
4. Prefer a temporary test harness over modifying production scripts.
5. Use assertions and return a structured result; do not rely on `print()` because tool output does not capture it reliably.
6. Use timeouts on every `WaitForChild` and avoid infinite loops, `DataStore`, or long waits in direct `execute_luau` calls.
7. Clean up temporary test instances after the test, even when an assertion fails.
8. Report passed tests, failed tests, and the first useful error with the script path and line when available.

## Recommended test harness

For pure Edit-mode logic, run a temporary ModuleScript or use `execute_luau` with code shaped like this:

```lua
local passed = 0
local failed = 0
local failures = {}

local function test(name, callback)
    local ok, result = pcall(callback)
    if ok and result ~= false then
        passed += 1
    else
        failed += 1
        failures[#failures + 1] = {
            name = name,
            error = tostring(result),
        }
    end
end

-- Add focused tests here.
test("example", function()
    assert(1 + 1 == 2, "math is broken")
    return true
end)

return {
    passed = passed,
    failed = failed,
    ok = failed == 0,
    failures = failures,
}
```

## Context-specific testing

- **Edit:** test ModuleScripts, object structure, attributes, and deterministic utility functions.
- **Server:** use a temporary Script and Play mode when testing server-only services, RemoteEvents, DataStores, or server authority.
- **Client:** use a LocalScript and Play mode when testing PlayerGui, UserInputService, camera behavior, or LocalPlayer-dependent code.
- **Integration:** start Play mode, wait for the required instances with bounded timeouts, run the scenario, collect results, then stop Play mode.

## Safety

Never destroy broad hierarchies during a test. Create temporary objects under a clearly named container such as `ServerStorage.RanjiServerTest`, and remove only that container when finished. Do not overwrite the user's production script unless explicitly requested.

## Future MCP tool contract

A dedicated `run_script_tests` tool should accept:

- `test_path`: dot-path to a Script, LocalScript, or ModuleScript
- `datamodel_type`: `Edit`, `Server`, or `Client`
- `timeout_seconds`: bounded timeout, default 20
- `cleanup`: whether temporary test objects should be removed, default true

It should return:

```json
{
  "ok": true,
  "passed": 3,
  "failed": 0,
  "failures": [],
  "duration_ms": 124
}
```
