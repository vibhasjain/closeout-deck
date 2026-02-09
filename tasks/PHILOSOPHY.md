# Tasks — Philosophy

We don't use Jira, Linear, or any ticketing system. Those tools try to straight-jacket you into someone else's workflow.

This is a static task board that lives in the repo. It deploys automatically. There are no logins, no permissions, no sprint ceremonies. We're all devs — we just push to the repo when something changes.

## Why this exists

- **Visibility.** Engineers, PMs, and stakeholders can all see what's happening at a glance without needing an account or an invite.
- **Simplicity.** One JS file is the source of truth. Edit the array, push, done.
- **No process tax.** No ticket templates, no required fields, no status workflows that don't match how we actually work.
- **Lives with the code.** Tasks are versioned alongside the product. The history is in git.

## How it works

- `tasks.js` holds all the data — people, clients, and tasks.
- Columns are organized by person, not by status. We care about who's doing what.
- Tasks can optionally have a client, a description, and a status.
- To change anything, edit `tasks.js` and push.

## Principles

- **Keep it flat.** No nested subtasks, no epics, no dependency graphs. If a task is too big, break it into smaller tasks.
- **People over process.** The board shows who owns what. Conversations happen in person or on calls, not in ticket comments.
- **Don't over-engineer this.** It's a visibility tool, not a product. If it stops being useful, change it or throw it away.
