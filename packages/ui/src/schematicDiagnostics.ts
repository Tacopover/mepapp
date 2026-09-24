import { getCircuitLabel, type Circuit, type Panel, type SchematicDiagnostic } from '@mepapp/core';

/** Plain sentences for the generator's diagnostics, shared by the schematic viewer and the template editor. */
export function describeDiagnostics(diagnostics: SchematicDiagnostic[], circuits: Circuit[], panel: Panel | undefined): string[] {
  const notes: string[] = [];
  const unplaced = diagnostics.filter((d) => d.kind === 'no-matching-group');
  if (unplaced.length > 0) {
    const labels = unplaced.map((d) => {
      const circuit = d.kind === 'no-matching-group' ? circuits.find((c) => c.id === d.circuitId) : undefined;
      return circuit ? getCircuitLabel(circuit, panel) : d.kind === 'no-matching-group' ? d.circuitId : '';
    });
    notes.push(`${unplaced.length} circuit${unplaced.length === 1 ? ' has' : 's have'} no matching group in this template and ${unplaced.length === 1 ? 'is' : 'are'} not drawn: ${labels.join(', ')}.`);
  }
  const errors = diagnostics.filter((d) => d.kind === 'binding-error');
  if (errors.length > 0) {
    const messages = [...new Set(errors.map((d) => (d.kind === 'binding-error' ? d.message : '')))];
    notes.push(`${errors.length} text binding${errors.length === 1 ? ' is' : 's are'} invalid in this template: ${messages.join('; ')}`);
  }
  return notes;
}
