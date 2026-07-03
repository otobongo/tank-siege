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

(none yet)
