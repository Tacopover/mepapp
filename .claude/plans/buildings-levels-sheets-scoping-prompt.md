# Prompt: scope Buildings, Levels, Sheets and the features that depend on them

Paste this prompt into a new Claude Code session in `/root/MepApp`. This session scopes only. It writes no product code.

## Goal

MEPSketcher (the old app, source in `/root/MepSketcher`) has a model of Building -> Level -> Sheet. MepApp has only a small first slice of it. Several old features depend on the full model. Find out what the old app does, how it can fit into MepApp, and which implementation options exist. Write the result as a spec with options and one recommendation. Do not implement.

## Background from the previous session

The previous session added "Export quantities to Excel" (branch `worktree-quantities-export`, last commit `61dad58`). The old app has three takeoff scopes: Current Sheet, Current Level, Current Building. MepApp has only one: the whole open document. The other two scopes need the model that this session must scope.

Facts already established (verify them, do not trust them blindly):

- Old takeoff code: `/root/MepSketcher/MepSketcherTools/Services/Takeoff/` (`TakeoffCollector.cs` resolves scope to sheets, `TakeoffRowBuilder.cs`, `CsvTakeoffWriter.cs`). The UI entry is in `MEPSketcher2/ViewModels/MainWindowViewModel.Dialogs.cs` (`ExportTakeoffAsync`).
- Old registry: `MepSketcherTools/Services/BuildingRegistryService.cs` and `MepSketcherTools/MEP/Building`. A sheet is a `BuildingSheetRef` (PDF path, PDF hash, `DocumentId`, page index, display name, cached scale). Data for other sheets is read from per-document project JSON, so no second PDF is opened.
- Old document identity: a `DocumentId` GUID embedded in the PDF catalog, with a path hash as the fallback for PDFs never stamped.
- MepApp today: `packages/ui/src/buildings.ts` (localStorage registry; a level holds only one document file name), `packages/ui/src/components/ManageBuildingsDialog.tsx`. There is no per-sheet (per PDF page) assignment and no calibration override.
- MepApp stamps have no `pageIndex`. Segments, fittings and rooms do. Check how this affects any per-sheet scope.
- MepApp calibration is per page and saved in the project file (`calibrations` in `packages/core/src/project.ts`).
- Related memory and plans: storage interfaces (`project-storage-interfaces`), feature atlas (`project-feature-atlas-priority-order`), and the hub at `/taco/notes/Obsidian Vault/Project Docs/MepApp/` (look for the atlas and any Buildings row, "ui-atlas-layout-mapping.md").

## Questions to answer

1. **Old behavior.** Describe exactly how Buildings, Levels and Sheets work in MEPSketcher: the data model, the Building Management window, how a sheet is linked to a PDF page, how scale is cached per sheet, and what else reads the model (takeoff, navigation, copy and paste between sheets, anything else). Cite file and line.
2. **Full feature list.** List every other MEPSketcher feature that MepApp does not have yet, and mark which ones depend on the building model. Use the feature atlas in the hub as a start. Do not repeat features that are already shipped.
3. **Fit in MepApp.** For the building model, decide how it fits the MepApp architecture: the package that owns it (`core`, `platform`, `ui`), the storage (localStorage today, the storage interfaces from Phase 1+2), and how it works on both web and Tauri desktop.
4. **Options.** Give at least three implementation options for the hard parts, each with cost, risk and what it cannot do. The hard parts are at least:
   - Reading data of sheets that are not open. Options include: keep a saved summary per document, read the other project files on demand, or require the documents to be open.
   - Document identity: embedded id in the PDF, content hash, file name, or a project-level id.
   - Multi-page documents: one document with many sheets, and stamps that have no page.
   - Where the registry lives: browser storage, a project file, or a folder on disk (Tauri).
5. **Takeoff scopes.** Say what the Level and Building takeoff scopes need from the model. Say how the existing `buildQuantityTables` in `packages/core/src/quantities.ts` and the writer in `packages/ui/src/quantitiesExport.ts` would extend (provenance columns Building, Level, Sheet; one workbook or several).
6. **Open decisions.** List the decisions the user must make, each with your recommendation.

## Constraints

- This is a scoping session. Change nothing in `apps/`, `packages/` or other product code.
- Follow `/root/MepApp/CLAUDE.md`. Call `EnterWorktree` before you write any file. Commit the spec to `.claude/plans/` on your worktree branch and push that branch. Do not push to `master`.
- Nothing outside `pdf-engine-mupdf` may import `mupdf`. No paid or non-free dependency (AGPLv3).
- Reuse an existing mechanism before you design a new one (see memory `feedback-reuse-existing-mechanisms-before-designing-new`).
- Delegate surveys of the old code to subagents (`researcher`, `Explore`). Do the decisions yourself. After the draft, run `roadmap-auditor` and `mep-domain-checker` on the spec if it touches MEP data.
- Ask the user a question only when you are blocked on a decision that is theirs. Otherwise state your assumption.

## Deliverable

One file: `.claude/plans/buildings-levels-sheets-spec.md`, with these sections:

1. What the old app does (with citations).
2. Gap list: old features missing in MepApp, ranked by value and by dependency on the building model.
3. Proposed data model and where it lives.
4. Options for each hard part, with a table of cost, risk and limits.
5. Recommendation and a phased plan (small phases, each with a way to verify it).
6. Open decisions for the user.

End your final message with the path of the spec file and the three most important open decisions.
