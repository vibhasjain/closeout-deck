const QUERY = `
  query ($teamId: String!) {
    team(id: $teamId) {
      members { nodes { id name } }
      states { nodes { id name type color } }
      issues(first: 200, filter: { state: { type: { nin: ["canceled"] } } }) {
        nodes {
          id identifier title description
          state { id name type color }
          assignee { id name }
          project { id name }
          dueDate sortOrder priority priorityLabel
        }
      }
    }
  }
`

export default async () => {
  const apiKey = Deno.env.get('LINEAR_API_KEY')
  const teamId = Deno.env.get('LINEAR_TEAM_ID') || 'c6ee04bd-5c60-43e1-bfd0-5bd3f0c1392a'

  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'LINEAR_API_KEY not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
    body: JSON.stringify({ query: QUERY, variables: { teamId } }),
  })

  const data = await res.json()

  return new Response(JSON.stringify(data), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
  })
}

export const config = { path: '/api/linear' }
