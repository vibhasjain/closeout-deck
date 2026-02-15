import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const TEAM_ID = 'c6ee04bd-5c60-43e1-bfd0-5bd3f0c1392a'

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

function linearProxyPlugin(apiKey) {
  return {
    name: 'linear-proxy',
    configureServer(server) {
      server.middlewares.use('/api/linear', async (req, res) => {
        try {
          const response = await fetch('https://api.linear.app/graphql', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': apiKey,
            },
            body: JSON.stringify({ query: QUERY, variables: { teamId: TEAM_ID } }),
          })
          const data = await response.json()
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), tailwindcss(), linearProxyPlugin(env.LINEAR_API_KEY)],
    base: './',
    server: {
      port: 5174,
    },
  }
})
