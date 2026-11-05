# UX lessons

Read this file first if you are the `ux-designer`, the `ui-reviewer` or the `journey-tester`. Each line is one lesson from a real user test. A lesson is a general rule. The text after "Seen:" is the case where the rule failed.

Source of the first 18 lines: the Building dialog (stream `buildings`, tasks B3-T01 to B3-T13). Every automated check passed. The user then found 30+ problems in 3 Windows test rounds. The user reports below are summaries, not word-for-word quotes. Item numbers (U1 to U19) match `.claude/plans/agent-framework-ux-update.md`.

Add a new line when a user test finds a problem that no agent found. Write the rule, not the case. If you cannot write a rule that applies to another task, do not add the line.

## Lessons

- **L1 Derive it or ask for it (U1).** If the data can derive a value, the screen gets no control for that value. Seen: Move up, Move down and "Sort by elevation" on levels, when the elevation can define the order.
- **L2 An action acts on the current selection (U2).** If the user selected a target, an add or an open action uses it. It does not add an extra step or an extra state. Seen: "Add folder" put pages under "Not placed" while a level was selected.
- **L3 A repeated action stays repeatable (U3).** After an action ends, the user stays where the next action starts. Seen: "Open" closed the whole dialog, so the user could not open 3 PDFs in a row.
- **L4 A list keeps its order (U4).** Selecting or editing an item never moves it. Seen: the selected building jumped to the top.
- **L5 The user must own every concept on the screen (U5, U19).** An internal state or an implementation limit is not a command and not a task. Seen: "Close building" (an internal "open building"), "Not placed", and "Save it to link it" (the id lives in the saved PDF).
- **L6 Every action shows its result (U6, U17).** A failure or a skip says what happened and what to do, in a place that the user sees, with the full text. Seen: an export of an unsaved PDF failed with a cut text at the top right. "Add folder" skipped a PDF that was on another level and said nothing.
- **L7 Layout is a grid, not a flow (U7).** Rows have the same column edges. Sections have a title and a border. The first fields are the identity fields (name first). A minor section is smaller than a major one. Seen: rows moved with the length of the file name, and "Add PDF" was as big as a main section.
- **L8 A web test fake hides a platform difference (U8).** For each platform API, list what the fake hides. Each hidden item becomes a numbered step in the platform test script. Seen: the file picker allowed 1 file. The fake picker never showed it.
- **L9 A test step must be possible on the test machine (U9).** Check each step of a test script: can one PC do it? Seen: a "No access" step needed a second PC.
- **L10 Every entity has the actions that the user expects (U10).** List the entity by action table: create, rename, delete, move, open, undo. A missing cell is a finding or a written decision. Seen: a building could not be renamed.
- **L11 Look at every state of every screen (U11, U14).** Empty, loading, error, partial, done, disabled, already done. Look at the empty state first. Seen: an "Untitled" entry in a list when no PDF was open. The "Open" button looked the same after the PDF was open.
- **L12 A message says what happened and what to do (U12).** No internal term. Plain words. Seen: "Remove its 2 sheets first".
- **L13 The user cannot reach a state that the rules forbid (U13).** Hide or disable the action, and say why. Seen: PDFs could be assigned to the building and not to a level.
- **L14 Every visible control does something (U15).** A label that is not a control looks like a control only if it does something. Seen: an "Open" badge on a building did nothing.
- **L18 A fix for a user report needs a check that fails before the fix (U18).** A check that passes before and after the fix proves nothing. Seen: the multi-file picker report was "fixed" with a test-only change.

## Rules that come from the process, not from one screen

- **L15 A check that the implementer wrote confirms the design.** It cannot find a missing feature, a bad flow or a bad text. A second agent writes the journey check from the UX spec.
- **L16 A reviewer finding must get a decision.** The T11 review listed 22 findings. Some were never fixed or never rejected in writing (two close buttons, one file at a time in the picker). Each finding ends as `fixed`, `accepted` with a reason, or `open`.
- **L17 The user sees the screen first at the end.** Show a wireframe before the implementation for a new dialog or a big change.
