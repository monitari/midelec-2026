// unitedstates/congress-legislators legislators-current.json → src/data/house-members.json
// Usage: node scripts/build-members.mjs <path/to/legislators-current.json>
// Pre-election holder of each voting House seat. Seats missing from the file are vacancies.
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/build-members.mjs <legislators-current.json>');
  process.exit(1);
}
const NON_VOTING = new Set(['AS', 'DC', 'GU', 'MP', 'PR', 'VI']);
const PARTY = { Democrat: 'D', Republican: 'R', Independent: 'I' };

const members = {};
for (const p of JSON.parse(readFileSync(src, 'utf8'))) {
  const t = p.terms.at(-1);
  if (t.type !== 'rep' || NON_VOTING.has(t.state)) continue;
  const key = `${t.state}-${String(t.district).padStart(2, '0')}`;
  members[key] = {
    name: p.name.official_full ?? `${p.name.first} ${p.name.last}`,
    party: PARTY[t.party] ?? 'O',
  };
}
const out = 'scripts/data/house-members.json';
writeFileSync(out, JSON.stringify(members, null, 0));
const n = Object.keys(members).length;
console.log(`${out}: ${n} seats (${435 - n} vacant)`);
