// TEMPLATE, not verified syntax. Before first use, the build must check
// code.claude.com/docs/en/workflows and rewrite this file in the current
// dynamic workflow API. Keep the shape; fix the calls.
//
// Pattern: adversarial fan-out. L goals only, run by the lead during VERIFY.
//
// Shape:
//   const lines = readUncheckedLines('.forge/DOD.md');
//   const verdicts = await Promise.all(lines.map(line =>
//     spawnAgent({
//       model: 'sonnet',
//       prompt: verifyLinePrompt(line),  // evidence or a defect, nothing else
//     })
//   ));
//   const ruling = await spawnAgent({
//     model: 'inherit',
//     prompt: mergeVerdictsPrompt(verdicts), // PASS at 100 percent only
//   });
//   writeFile('.forge/RUNLOG.md', appendEntry('verify-fanout', ruling));
