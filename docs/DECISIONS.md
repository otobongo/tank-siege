# Interface-change log

Public interfaces are defined by the issue that owns each module (see the
implementation plan, dispatch rule 3). Later issues consume those interfaces
as-is. If an interface change is genuinely required, record it here with a
one-paragraph justification BEFORE making the change.

## Entry template

```
### YYYY-MM-DD · TS-0XX changes <module>.<symbol> (owned by TS-0YY)

- Change: <old signature / behavior> -> <new signature / behavior>
- Justification: <one paragraph: why the existing interface cannot serve the
  new requirement, and why this change is the minimal one>
- Call sites updated: <list>
```

## Entries

### 2026-07-04 · TS-004 resolves a spec conflict in brick damage depth

- Change: `CONFIG.tank.player.brickDepthByTier` [null,2,2,2,4] -> [null,1,1,1,2]
- Justification: Plan section 2 says a bullet removes a "2-quarter-deep"
  swath, but the TS-004 acceptance tests require 4 same-column shots to
  breach a one-block wall (4 quarters deep) and 2 shots at tier 4. Both
  cannot hold; the test cases are the acceptance criteria, so per-shot
  depth is 1 quarter (tier 4: 2 quarters). The swath stays 4 quarters wide.
- Call sites updated: none (value change only, no consumers yet)
