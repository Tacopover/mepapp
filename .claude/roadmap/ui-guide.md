# UI pattern guide

Read this file first if you are the `ux-designer` or a task lead for a task that changes a screen. It lists the patterns that the app already uses. A new screen uses these patterns. A new pattern needs a reason in the UX spec.

Source: the final Building dialog on the branch `worktree-buildings-model` (`packages/ui/src/components/BuildingSection.tsx`, `BuildingSheetsPane.tsx`, and the block "Building dialog: sections" in `packages/ui/src/theme.css`). Check that these files still match before you copy a number. Use the CSS tokens (`--line`, `--surface`, `--surface-2`, `--paper`, `--ink`, `--muted`). Do not hard-code a color.

## 1. Section card

A section has a **title bar** and a **body**.

- The card has a 1 px border (`--line`), a 4 px radius, and 12 px space below.
- The title bar is 34 px high at minimum, with 6 px by 12 px padding, a `--surface-2` background, and a 1 px line below it.
- The title is on the left (14 px, weight 600, one line, ellipsis, tooltip with the full text). A small kind word (10 px, upper case, `--muted`) can come before it.
- The count or the action of the section is on the right of the title bar (12 px, `--muted`).
- The body has 10 px by 12 px padding.
- A **major section** is a main task of the screen. A **minor section** is a helper (for example "Add files"). A minor section is quiet: 26 px title bar, a transparent title bar, a 12 px title, buttons of 12 px. A minor section never has the size of a major one.
- The identity fields of an entity (name, elevation) are the first fields of the first section.
- Components: `BuildingSection` (`quiet` prop for a minor section). Reuse it.

## 2. List row grid

- A list row is a CSS grid with fixed columns. The name column is `minmax(0, 1fr)`. The other columns have a fixed width (for example status 96 px, action columns 84 to 104 px).
- Each row of one list uses the same columns, so the edges line up. The width of a column never depends on the length of a name.
- A long name is cut with an ellipsis. The full name is in the `title` tooltip.
- Status is in one column. Actions are right aligned and in a fixed order.
- At a narrow width (760 px), the grid drops the least important column. It does not wrap the buttons into odd places.
- A list keeps its order when the user selects an item. The order comes from the data (for example alphabetical, or by elevation).

## 3. Buttons

- **Primary:** one for each section at most. It does the main task of the section.
- **Secondary:** the plain grey button.
- **Destructive:** a delete or a remove. It has its own label ("Delete level", not "Remove") and sits away from the primary button. It asks to confirm, or it is undoable. Do not use `window.confirm` (`rules.md`): use an in-app question.
- Two buttons with near-equal names (for example "Close" and "Close building") are a defect. Remove one, or name them for what they do.
- Place the buttons of a row at the right end of the row. Place the buttons of a section in its title bar (right) or at the bottom of its body.
- The dialog footer has only the dialog actions (Close, or Cancel and OK).

## 4. States of a control

- **Disabled:** the control is visible and dim. The reason is visible near it, in plain words, not only in a tooltip. Prefer to hide a control that can never apply.
- **Done or already done:** the label changes to the past ("Opened") and the control is off. It turns on again when the state ends. A control that looks the same after its action is a defect.
- **Busy:** the label or an icon shows progress. The user can cancel a long action.
- **Error:** the message sits where the action was, with the full text (no cut). It says what happened and what to do.

## 5. Empty states and messages

- An empty list shows one line that says what to do ("Add a level first.") and not an empty box. An empty list never shows a placeholder entry such as "Untitled".
- A result message names the numbers and the reason ("2 pages are already on Level 1 and were not moved."). A silent skip is a defect.
- Use the words of the user: sheet, level, building, PDF. Do not show an internal word (id, flag, store, link, not placed).
- A hint is grey (`--muted`), 12 px, one sentence.
- A notice stays until the next action of the user or until it is no longer true. Do not add a "Dismiss" button for a notice that the next action replaces.

## 6. Dialogs

- A dialog has a title, a body, and a footer. The body scrolls under a title with a visible divider.
- A dialog does not change its top or its height when a section gets content. Give it a stable height or a stable top.
- The first focus goes to the first field or to the main control, not to the page body. Escape closes the dialog (`Dialog.tsx` handles it).
- A dialog that has a list and a detail uses a left tree or list, and a right detail with sections. A dialog does not close after an action that the user may repeat (L3).
- Test at 1600, 1100 and 760 px wide. The dialog must work at 760 px.

## 7. Text style

- Sentence case for labels and messages. No full stops on a button.
- A button label is a verb or a verb and its object ("Add PDFs…", "Rename"). An ellipsis means that a picker or a dialog follows.
- Numbers have units ("3000 mm").
