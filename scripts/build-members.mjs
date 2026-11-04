// unitedstates/congress-legislators legislators-current.json →
//   scripts/data/house-members.json   선거 전 하원 의석 보유자 (파일에 없는 선거구는 공석)
//   scripts/data/congress-roster.json 현직 상·하원 의원 명단 (후보 사진 연결용 bioguide ID)
// Usage: node scripts/build-members.mjs <path/to/legislators-current.json>
import { readFileSync, writeFileSync } from 'node:fs';

const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/build-members.mjs <legislators-current.json>');
  process.exit(1);
}
const NON_VOTING = new Set(['AS', 'DC', 'GU', 'MP', 'PR', 'VI']);
const PARTY = { Democrat: 'D', Republican: 'R', Independent: 'I' };

const members = {};
const roster = [];
for (const p of JSON.parse(readFileSync(src, 'utf8'))) {
  const t = p.terms.at(-1);
  roster.push({ b: p.id.bioguide, first: p.name.first, last: p.name.last, nick: p.name.nickname, state: t.state });
  if (t.type !== 'rep' || NON_VOTING.has(t.state)) continue;
  const key = `${t.state}-${String(t.district).padStart(2, '0')}`;
  members[key] = {
    name: p.name.official_full ?? `${p.name.first} ${p.name.last}`,
    party: PARTY[t.party] ?? 'O',
  };
}
writeFileSync('scripts/data/house-members.json', JSON.stringify(members, null, 0));
writeFileSync('scripts/data/congress-roster.json', JSON.stringify(roster, null, 0));
const n = Object.keys(members).length;
console.log(`house-members: ${n} seats (${435 - n} vacant) · congress-roster: ${roster.length}`);
