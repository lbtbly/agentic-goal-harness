// TEMPLATE, not verified syntax. Before first use, the build must check
// code.claude.com/docs/en/workflows and rewrite in the current API.
//
// Pattern: loop until done. Run by the lead at VERIFY when the defect count is
// unknown. Fixed passes stop early; a stop condition does not.
//
// Stop condition: a full sweep returns no new defects. Not "three passes".
//
// Shape:
//   let seen = new Set(), round = 0;
//   while (round < 8) {                      // hard ceiling, not the exit
//     const found = await Promise.all(areas.map(a =>
//       spawnAgent({ model: 'sonnet', prompt: sweepPrompt(a, rubric) })
//     ));
//     const fresh = dedupeAgainst(found, seen);
//     if (fresh.length === 0) break;         // the real exit
//     fresh.forEach(d => seen.add(d.id));
//     await spawnAgent({ model: 'sonnet', prompt: fixPrompt(fresh) });
//     round++;
//   }
//   writeFile('.forge/RUNLOG.md', appendEntry('defect-sweep', summary(seen)));
