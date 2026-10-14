import { readFile, mkdir, writeFile, appendFile } from 'node:fs/promises';
import { releasePlan, releaseTargets } from './release-plan.mjs';
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const plan = releasePlan(pkg.version, process.env);
await mkdir('.local', { recursive: true });
await writeFile('.local/release-plan.json', JSON.stringify(plan, null, 2));
await writeFile(
  '.local/builder-release.json',
  JSON.stringify(
    {
      ...pkg.build,
      extraMetadata: {
        version: plan.version,
        homepage: plan.homepage,
        repository: { type: 'git', url: `${plan.homepage}.git` },
      },
      mac: { ...pkg.build.mac, identity: '-', hardenedRuntime: false },
    },
    null,
    2,
  ),
);
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `version=${plan.version}\ntag=${plan.tag}\nmatrix=${JSON.stringify({ include: releaseTargets })}\n`,
  );
console.log(`Prepared ${plan.title} from ${plan.sha}`);
