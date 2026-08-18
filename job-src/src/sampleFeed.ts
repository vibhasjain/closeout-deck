import type { Feed } from './types.ts'

export const sampleFeed: Feed = {
  updatedAt: '2026-08-18T22:42:00.000Z',
  candidates: [
    {
      id: 'c-sample-one',
      name: 'Maya Sample',
      email: 'maya.sample@example.com',
      appliedAt: '2026-08-18T16:05:00.000Z',
      source: 'email',
      status: 'new',
      summary: 'Operations lead with marketplace and support experience.',
      flags: [],
      thread: [
        {
          id: 't-sample-one-in',
          dir: 'in',
          at: '2026-08-18T16:05:00.000Z',
          subject: 'Application — Operations Lead',
          text: 'Hi team, I’m excited to apply. I’ve spent five years building support operations for two-sided marketplaces and would love to speak.',
          attachments: [{ name: 'Maya-Sample-Resume.pdf', path: 'files/c-sample-one/resume.pdf' }],
        },
      ],
      draft: null,
    },
    {
      id: 'c-sample-two',
      name: 'Theo Example',
      email: 'theo.example@example.com',
      appliedAt: '2026-08-17T19:20:00.000Z',
      source: 'linkedin',
      status: 'drafted',
      summary: 'Customer systems builder with early-stage recruiting experience.',
      thread: [
        {
          id: 't-sample-two-in',
          dir: 'in',
          at: '2026-08-17T19:20:00.000Z',
          subject: 'Interested in the role',
          text: 'I saw the opening and the mix of operations, product thinking, and direct customer work stood out to me.',
        },
        {
          id: 't-sample-two-note',
          dir: 'internal',
          at: '2026-08-17T19:28:00.000Z',
          text: 'Strong marketplace overlap. Drafted a concise reply that asks for one concrete example before scheduling.',
        },
        {
          id: 't-sample-two-out',
          dir: 'out',
          at: '2026-08-17T20:01:00.000Z',
          text: 'Thanks for reaching out, Theo. Your experience looks relevant to what we are building.',
        },
      ],
      draft: {
        id: 'd-sample-two',
        subject: 'Re: Interested in the role',
        text: 'Hi Theo,\n\nThanks for the thoughtful note. Could you share one example of a customer workflow you designed from scratch and how you measured whether it worked?\n\nBest,\nVibhas',
        createdAt: '2026-08-18T14:12:00.000Z',
        rationale: 'Asks for a concrete signal on systems thinking before moving to scheduling.',
      },
    },
    {
      id: 'c-sample-three',
      name: 'Jordan Demo',
      email: 'jordan.demo@example.com',
      appliedAt: '2026-08-15T17:40:00.000Z',
      source: 'email',
      status: 'meeting-scheduled',
      summary: 'Marketplace generalist scheduled for an introductory conversation.',
      thread: [
        {
          id: 't-sample-three-in',
          dir: 'in',
          at: '2026-08-15T17:40:00.000Z',
          subject: 'Job application',
          text: 'I’d love to learn more about the role. I’ve attached my background and included a few relevant projects below.',
        },
        {
          id: 't-sample-three-out',
          dir: 'out',
          at: '2026-08-16T18:30:00.000Z',
          text: 'Thanks, Jordan. Your background looks promising. I’ve sent a link to find a time for an introductory call.',
        },
      ],
      draft: null,
    },
  ],
  meetings: [
    {
      candidateId: 'c-sample-three',
      at: '2026-08-20T18:00:00.000Z',
      source: 'Google Calendar',
      status: 'scheduled',
    },
  ],
}
