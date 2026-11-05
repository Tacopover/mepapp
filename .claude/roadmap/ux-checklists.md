# UX checklists

The long lists for the `ux-designer`, the `ui-reviewer` and the `journey-tester`. The agent files stay short and point here. Read `ux-lessons.md` first.

Terms. A **journey** is a goal of a user with the steps to reach it. A **step** is one click, one typed entry, or one picker. A **friction** is an extra step, an unclear text, a dead control, a state with no message, or a moment where the user must guess.

## A. The UX spec (the `ux-designer` writes it)

The spec is one file in the work folder: `<work>/ux/<task id>-spec.md`. It has these parts. Keep each part short. A part that does not apply says "not applicable" and why.

1. **Concepts.** The nouns that the user sees. For each noun: does the user already have this concept (from the old MEPSketcher, from the PDF, from the drawing)? A noun that only the code has does not go on the screen (L5).
2. **Journeys.** At least 3. For each one: the goal in one sentence, the start state, the steps, the number of steps, and what the user sees after each step. Include one journey that repeats the main action 3 times (L3). Include one journey from an empty start.
3. **Entity by action table.** Rows: each entity (a building, a level, a sheet). Columns: create, rename, delete, move, open, undo, select. Each cell: the control, or "none" with the reason, or "derived" (L1, L10).
4. **State table for each screen.** Rows: empty, loading, error, partial, done, disabled, already done. Each cell: what the user sees and which controls are on (L11, L13).
5. **Derive it or ask for it.** A list of each value that the user could set. Mark each as "derived" (no control) or "asked" (a control, with the reason that data cannot derive it).
6. **Texts.** Every label, button, message, tooltip and empty-state text, word for word. Rules: plain words; say what happened and what to do; one word for one thing; no internal term; no cut text for an error (L6, L12).
7. **Layout.** An ASCII wireframe at the widest and at the narrowest size. The grid (columns of a list row and their widths). The section titles. The order of the sections. Which sections are major and which are minor (L7). Follow `ui-guide.md`.
8. **Platform table.** For each platform API of the task (file picker, drag and drop, path, access scope, save): what the web test fake does, what the real platform does, and what the fake hides (L8). Each hidden item is a numbered step for the platform test script.
9. **Open questions.** Each question for the user, with 2 to 4 options and a recommendation. A question that changes the data model stops the task (protocol section 3).

For a new dialog or a big change, the director shows the wireframe and the texts to the user before the implementation starts (protocol section 4a).

## B. Layout measurement (the `ui-reviewer` runs it)

Use `.claude/roadmap/browser/layout-measure.mjs`. It exports functions that take a Playwright `page` and return bounding boxes. Run it at 1600, 1100 and 760 px wide. Check:

- **Column edges.** In a list, each row has the same left edge for the same column. A difference of more than 1 px is a finding.
- **Gutters.** The gap between two columns and between a control and the edge is the same in each row.
- **Overflow.** No control or text is cut at the side of its section or of the dialog. A cut name has an ellipsis and a tooltip with the full text.
- **Section order and size.** The identity fields (name, elevation) come first. A minor section is smaller than a major one.
- **Stress data.** Run again with 30 rows and with names of 80 characters.
- **Stability.** The dialog top and height do not jump when a section gets or loses content. A list keeps its order after a select (L4).

## C. The audits (the `ui-reviewer` and the `journey-tester` run them)

1. **Dead-control audit.** List every visible control: its label and what it does (click it, read the result). A control with no effect, or a label that looks like a control, is a finding (L14).
2. **Invalid-state audit.** Try to reach each state that the rules forbid. Try an action on an empty selection, on a selection of the wrong kind, twice in a row, and in the wrong order. Each reachable forbidden state is a finding (L13).
3. **Copy audit.** Read every message and label that you can trigger. For each: does it say what happened, and what to do? Does it use a word that the user does not have? Is it cut? (L6, L12).
4. **Feedback audit.** For each action: what does the user see during it, after it, and after a failure? A silent skip, a silent failure, and a button that looks the same after the action are findings (L6, L11).
5. **Entity by action audit.** Compare the UX spec table with the screen. A missing control that the table promises, or a control that the table does not list, is a finding (L10).
6. **Derivation audit.** Does a control set a value that the data could derive? (L1).
7. **Selection audit.** Does each add or open action use the current selection as its target? (L2).

## D. Nielsen's 10 heuristics (a quick pass at the end)

1. Visibility of system status. 2. Match between the system and the real world (the user's words). 3. User control and freedom (undo, cancel, close). 4. Consistency and standards (the same word and look as the rest of the app). 5. Error prevention. 6. Recognition rather than recall. 7. Flexibility and efficiency (repeat an action, keyboard). 8. Aesthetic and minimal design (no extra control). 9. Help users recover from errors (plain text and a next step). 10. Help and documentation (a hint where a choice is not clear).

## E. The journey test (the `journey-tester` runs it)

- Get a goal, not steps. The goal is a sentence from the UX spec, for example "put three PDFs on Level 1, then open each one".
- Play a first-time user. You do not know the screen. Find the control from its label. If you must guess, write a friction.
- Use real clicks and typing (`rules.md` section 3, rule 5). Use `window.__mepSketchScene` only to set up and to read state.
- Run each journey at 1600, 1100 and 760 px wide. Run each journey from nothing (an empty profile) and from a full state (30 rows, names of 80 characters).
- Count the steps of each journey. Compare with the number in the UX spec. A higher number is a finding.
- Write the friction log: for each friction, the journey, the step, what you saw, what you expected, the screenshot path.
- After the journeys, run the audits of section C on the screens that you met.
