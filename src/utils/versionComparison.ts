import type {AssessmentVersion, Criterion} from '../types/managerAssessment';
export function compareAssessmentVersions(older: AssessmentVersion, newer: AssessmentVersion): {id: string; name: string; older: Criterion | null; newer: Criterion | null; changed: boolean}[] {
  const index = (rows: Criterion[]) => new Map(rows.map((row, i) => [row.id || `row-${i}`, row]));
  const a = index(older.breakdown), b = index(newer.breakdown);
  return [...new Set([...a.keys(), ...b.keys()])].map(id => {
    const before = a.get(id) || null, after = b.get(id) || null;
    return {id, name: after?.name || before?.name || id, older: before, newer: after,
      changed: !before || !after || before.points !== after.points || before.selectedOption !== after.selectedOption || before.comment !== after.comment};
  });
}
