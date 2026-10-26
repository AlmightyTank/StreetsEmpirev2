import { rulesets, questNarrativeAudit, questNarrativeAuditSummary } from '@streets/rulesets';

const TARGET_RULESET = 'classic-og-v2.6-j';
const ruleset = rulesets[TARGET_RULESET];
if (!ruleset?.questDefinitions) throw new Error(`Ruleset ${TARGET_RULESET} has no quest definitions`);
const issues = questNarrativeAudit(ruleset.questDefinitions, ruleset.contacts);
const missingStoryQuests = Object.values(ruleset.questDefinitions).filter((quest) => !quest.story);
const countBy = (values: readonly string[]) => values.reduce<Record<string, number>>((counts, value) => {
  counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}, {});
const rows = [{
  rulesetId: TARGET_RULESET,
  questCount: Object.keys(ruleset.questDefinitions).length,
  issues,
  summary: questNarrativeAuditSummary(issues),
}];

const totalJobs = rows.reduce((sum, row) => sum + row.questCount, 0);
const totalIssues = rows.reduce((sum, row) => sum + row.issues.length, 0);
const summary = rows.flatMap((row) => row.issues).reduce<Record<string, number>>((counts, issue) => {
  counts[issue.kind] = (counts[issue.kind] ?? 0) + 1;
  return counts;
}, {});

console.log(`Quest narrative audit: ${rows.length} rulesets, ${totalJobs} jobs, ${totalIssues} issues`);
console.log(JSON.stringify(summary, null, 2));
console.log('Missing stories by type:', JSON.stringify(countBy(missingStoryQuests.map((quest) => quest.type)), null, 2));
console.log('Missing stories by category:', JSON.stringify(countBy(missingStoryQuests.map((quest) => quest.category)), null, 2));
for (const row of rows) {
  if (!row.issues.length) continue;
  const issueKinds = Object.entries(row.summary).filter(([, count]) => count > 0).map(([kind, count]) => `${kind}=${count}`).join(', ');
  console.log(`${row.rulesetId}: ${row.questCount} jobs; ${issueKinds}`);
}

if (process.argv.includes('--details')) {
  for (const row of rows) {
    for (const issue of row.issues) console.log(`- ${row.rulesetId}: ${issue.kind}: ${issue.message}`);
  }
}
