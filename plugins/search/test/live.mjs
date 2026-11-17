// 실제 서비스에 한 번씩 검색해 보는 점검이에요. npm test에는 들지 않아요.
// 사용: node plugins/search/test/live.mjs ["검색어"]
// 키는 실행 환경 변수(TAVILY_API_KEY 등)에 있으면 쓰고, 없으면 키 없이 검색해요. 키 값은 찍지 않아요.
import { apply } from '../index.js'

const query = process.argv[2] ?? 'Node.js 24 release notes'
const providers = []
apply({ get: () => undefined, web: { registerSearchProvider: (p) => providers.push(p) } }, {})

console.log(`검색어: ${query}`)
for (const provider of providers) {
  const started = performance.now()
  try {
    const { sources, answeredBy } = await provider.search({ query, maxResults: 5 })
    const ms = Math.round(performance.now() - started)
    console.log(`${provider.id.padEnd(9)} 성공 ${String(sources.length).padStart(2)}건 ${ms}ms  ${answeredBy ? `(${answeredBy}) ` : ''}${sources[0]?.url ?? ''}`)
  } catch (error) {
    const ms = Math.round(performance.now() - started)
    console.log(`${provider.id.padEnd(9)} 실패 ${ms}ms  ${error.message}`)
  }
}
