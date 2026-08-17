// TEMPLATE, not verified syntax. Before first use, the build must check
// code.claude.com/docs/en/workflows and rewrite in the current API.
//
// Patterns: generate-and-filter, then tournament.
// Run by the lead during DESIGN, after the persona panel, before the designer
// commits to a direction. Taste decisions benefit from comparison, not scoring.
//
// Shape:
//   const rubric = readSection('.claude/skills/standards/SKILL.md');
//   // generate
//   const candidates = await Promise.all(range(5).map(i =>
//     spawnAgent({ model: 'sonnet', prompt: directionPrompt(brief, i) })
//   ));
//   // filter: drop anything failing the rubric or duplicating another
//   const survivors = await spawnAgent({
//     model: 'inherit',
//     prompt: filterPrompt(candidates, rubric),   // dedupe, reject, keep top 3
//   });
//   // tournament: pairwise judging until one direction stands
//   let bracket = survivors;
//   while (bracket.length > 1) {
//     const pairs = chunk(bracket, 2);
//     bracket = await Promise.all(pairs.map(p =>
//       spawnAgent({ model: 'inherit', prompt: judgePrompt(p, rubric) })
//     ));
//   }
//   writeFile('.forge/DESIGN.md', appendSection('Direction', bracket[0]));
