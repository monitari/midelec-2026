export interface StateInfo {
  abbr: string;
  name: string;
}

export const STATES: Record<string, StateInfo> = {
  '01': { abbr: 'AL', name: '앨라배마' },
  '02': { abbr: 'AK', name: '알래스카' },
  '04': { abbr: 'AZ', name: '애리조나' },
  '05': { abbr: 'AR', name: '아칸소' },
  '06': { abbr: 'CA', name: '캘리포니아' },
  '08': { abbr: 'CO', name: '콜로라도' },
  '09': { abbr: 'CT', name: '코네티컷' },
  '10': { abbr: 'DE', name: '델라웨어' },
  '11': { abbr: 'DC', name: '워싱턴 D.C.' },
  '12': { abbr: 'FL', name: '플로리다' },
  '13': { abbr: 'GA', name: '조지아' },
  '15': { abbr: 'HI', name: '하와이' },
  '16': { abbr: 'ID', name: '아이다호' },
  '17': { abbr: 'IL', name: '일리노이' },
  '18': { abbr: 'IN', name: '인디애나' },
  '19': { abbr: 'IA', name: '아이오와' },
  '20': { abbr: 'KS', name: '캔자스' },
  '21': { abbr: 'KY', name: '켄터키' },
  '22': { abbr: 'LA', name: '루이지애나' },
  '23': { abbr: 'ME', name: '메인' },
  '24': { abbr: 'MD', name: '메릴랜드' },
  '25': { abbr: 'MA', name: '매사추세츠' },
  '26': { abbr: 'MI', name: '미시간' },
  '27': { abbr: 'MN', name: '미네소타' },
  '28': { abbr: 'MS', name: '미시시피' },
  '29': { abbr: 'MO', name: '미주리' },
  '30': { abbr: 'MT', name: '몬태나' },
  '31': { abbr: 'NE', name: '네브래스카' },
  '32': { abbr: 'NV', name: '네바다' },
  '33': { abbr: 'NH', name: '뉴햄프셔' },
  '34': { abbr: 'NJ', name: '뉴저지' },
  '35': { abbr: 'NM', name: '뉴멕시코' },
  '36': { abbr: 'NY', name: '뉴욕' },
  '37': { abbr: 'NC', name: '노스캐롤라이나' },
  '38': { abbr: 'ND', name: '노스다코타' },
  '39': { abbr: 'OH', name: '오하이오' },
  '40': { abbr: 'OK', name: '오클라호마' },
  '41': { abbr: 'OR', name: '오리건' },
  '42': { abbr: 'PA', name: '펜실베이니아' },
  '44': { abbr: 'RI', name: '로드아일랜드' },
  '45': { abbr: 'SC', name: '사우스캐롤라이나' },
  '46': { abbr: 'SD', name: '사우스다코타' },
  '47': { abbr: 'TN', name: '테네시' },
  '48': { abbr: 'TX', name: '텍사스' },
  '49': { abbr: 'UT', name: '유타' },
  '50': { abbr: 'VT', name: '버몬트' },
  '51': { abbr: 'VA', name: '버지니아' },
  '53': { abbr: 'WA', name: '워싱턴' },
  '54': { abbr: 'WV', name: '웨스트버지니아' },
  '55': { abbr: 'WI', name: '위스콘신' },
  '56': { abbr: 'WY', name: '와이오밍' },
};

export const ABBR_TO_FIPS: Record<string, string> = Object.fromEntries(
  Object.entries(STATES).map(([fips, s]) => [s.abbr, fips]),
);

export const stateName = (abbr: string) => STATES[ABBR_TO_FIPS[abbr]]?.name ?? abbr;

export function districtCode(state: string, district: number) {
  return `${state}-${district === 0 ? 'AL' : String(district).padStart(2, '0')}`;
}
