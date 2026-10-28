# Routing conventions (knowledge file)

The agent `mep-routing-advisor` reads this file first and adds entries to it. The human designer confirms entries.

## Confidence levels

| Level | Meaning | Who sets it |
|---|---|---|
| `stated` | A source states it as a rule or a number. The entry has the URL and the clause. | Agent |
| `typical` | At least two independent sources show the same practice. No source states it as a rule. | Agent |
| `guess` | The agent reasoned from principles and found no source. | Agent |
| `confirmed` | The human designer checked the entry. | Designer only |
| `rejected` | The designer says the entry is wrong. The entry stays, with the reason, so the agent does not add it again. | Designer only |

## Entry format

```
### RC-<number> <short title>
- Discipline: duct | cable tray | pipe | all
- Topic: main | branch | riser | shaft | ceiling zone | clearance | crossing | wall penetration | other
- Rule: one sentence. State it as a condition that routing code can test.
- Confidence: stated | typical | guess | confirmed | rejected
- Sources: URL (clause or page) — what it states. Mark weak sources.
- Applies to: building type or condition. "All" if none.
- Added: YYYY-MM-DD by agent | designer
- Notes: contradictions, exceptions, open points. Optional.
```

## Open questions (queue)

These come from `.claude/plans/auto-routing.md`. The agent answers them one at a time and moves each answered one to the entries.

1. Mains only in corridors? Which ducts, pipes and trays use the corridor, and which do not?
2. Branches only through doors, or through any wall above the ceiling? When is a wall penetration normal?
3. How do branches leave a main (tap from the side, from above, at a fitting)? How far apart?
4. Cable trays versus ducts and pipes: normal height order and minimum clearance in a ceiling void.
5. Risers and shafts: how does a horizontal main reach a shaft, and where do the shafts sit in a plan?
6. Supply and return ducts of one air handling unit: do they run together or apart?
7. Sprinkler pipes: main and branch layout, spacing of branches.
8. Electrical: how cables run from a panel to rooms (tray on corridor, drop to the room, conduit in the wall or the ceiling).

## Entries

None yet.
