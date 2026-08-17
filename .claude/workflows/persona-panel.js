// TEMPLATE, not verified syntax. Before first use, the build must check
// code.claude.com/docs/en/workflows and rewrite this file in the current
// dynamic workflow API. Keep the shape; fix the calls.
//
// Pattern: fan-out-and-synthesize. Run by the lead during DESIGN on M and L.
//
// Shape:
//   const personas = readPersonas('.forge/BRIEF.md');        // three personas
//   const interviews = await Promise.all(personas.map(p =>
//     spawnAgent({
//       model: 'sonnet',
//       prompt: interviewPrompt(p),   // willingness, objections, table stakes
//     })
//   ));
//   const synthesis = await spawnAgent({
//     model: 'inherit',
//     prompt: synthesizePrompt(interviews), // 3 findings, 3 stakes, 1 risk
//   });
//   writeFile('.forge/BRIEF.md', appendSection('Panel', synthesis));
