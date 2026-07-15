# Closeout Copilot — Cinematic Diorama Scroll World Brief

## Creative decision

The world is a sequence of five **near-photoreal cinematic architectural dioramas**. “Diorama” describes the elevated, readable composition and connected spatial storytelling—not a toy aesthetic.

People have normal adult proportions. Rooms, furniture, venue infrastructure, workstations, and distances feel physically believable. The image should read like premium enterprise campaign photography captured from a controlled 35–45° elevated camera, with selective architectural cutaways only where they clarify the story.

Avoid:

- clay, plastic, toy, dollhouse, miniature figurine, mascot, chibi, or cartoon rendering
- humanoid robots, glowing AI brains, giant holograms, or generic “AI magic” clichés
- impossible crowd density, cramped rooms, floating furniture, or underscaled architecture
- text, logos, watermarks, legible UI, or generated typography
- overusing brand green; it is a navigation signal, not the entire world

## Brand kit

- Display name: **Closeout Copilot**
- Voice: calm, competent, human, transparent
- Void: `#080808`
- Graphite: `#161618`
- Panel: `#232326`
- Signal green: `#22C55E`
- Soft mint: `#86EFAC`
- Warm white: `#F4F4F5`

The environments should otherwise use plausible neutral materials: concrete, dark steel, warm office timber, real fabrics, natural skin tones, practical workwear, paper, glass, and restrained screens. Signal green appears in small status lights, path accents, and confirmed-state details.

## Shared Gemini preamble

Reuse this paragraph verbatim in every still prompt:

> Photorealistic cinematic architectural diorama with realistic adult human proportions and physically believable spatial scale, viewed from a controlled 40-degree elevated three-quarter camera. Premium enterprise campaign photography, real people in natural working posture, authentic materials, practical workplace lighting mixed with restrained cinematic light, deep but realistic depth of field, subtle atmospheric perspective, precise composition with clear negative space for editorial copy. Neutral graphite, concrete, steel, glass, warm office materials, natural skin tones and clothing; Closeout signal green #22C55E appears only as a restrained status accent. No text, no letters, no logos, no watermarks, no humanoid robot, no holographic brain, no cartoon, no clay, no plastic toy, no miniature figurines, no exaggerated proportions. 16:9, 4K.

## Scene 01 — The worker

**Story:** The shift is over, but the worker’s pay is not settled.

**Still subject:**

> A real event worker in practical uniform leaves a large venue after a long evening shift, normal adult proportions, phone in hand showing only an abstract unresolved status glow with no legible UI. Other workers exit naturally in the middle distance. Behind them, the venue is transitioning from active operations to close: rolling cases, cleaning crews, security gates, service corridors, believable human spacing. A subtle path of schedule, break, and clock evidence remains visually unresolved behind the worker. The emotional center is dignity and uncertainty, not distress: “I did the work; will the record be right?” Keep the worker slightly right of center so the camera can later dive toward the venue operations corridor.

**Copy:** The work is done. Pay shouldn’t be a question.

**Camera dive:** Begin above the post-event venue, descend toward the worker leaving the service corridor, then continue forward past the worker into the evidence trail behind the shift. End in a slow forward drift.

## Scene 02 — The staffing agency

**Story:** Every shift creates a worker-pay promise and a customer-billing promise.

**Still subject:**

> A realistic staffing agency finance and workforce operations office during evening close. A small team reviews a wall-scale but physically plausible set of monitors and paper records; one side represents worker payroll readiness and the other represents customer billing readiness, communicated only through layout, color, and abstract shapes with no text. At the center, one completed shift remains unresolved because schedule, time clock, and location evidence disagree. The room is spacious and believable, not a sci-fi control room. Show the pressure of accuracy, trust, and margin without depicting panic. Keep the unresolved shift visually central as the camera destination.

**Copy:** Every shift holds two promises.

**Camera dive:** Glide forward into the agency office, make a restrained half-orbit around the unresolved shift evidence, then carry forward toward the operations queue. End in a slow forward drift.

## Scene 03 — The operations team

**Story:** Humans have become the manual glue holding closeout together.

**Still subject:**

> A believable staffing operations floor after hours. Experienced operations specialists are each handling different fragments of shift closeout: one calls a worker, one waits on a facility supervisor, one compares time records, one reviews a meal-break exception. Normal office proportions, realistic desks and spacing, practical lighting, tired but focused people. Use layered sight lines to show the work multiplying across many shifts without turning the scene into chaos. A single genuine exception should be visually distinct from a much larger routine queue. The human story is capable people trapped in repetitive coordination.

**Copy:** Your best people shouldn’t spend the night chasing clocks.

**Camera dive:** Track laterally alongside the operations team with natural foreground parallax, pass the repetitive workstations, then continue forward toward the genuine exception at the center. End in a slow forward drift.

## Scene 04 — The Closeout Agent

**Story:** The agent owns the gap between completed work and a defensible decision.

**Still subject:**

> An architectural cutaway showing the Closeout Agent as an orchestration layer across real human spaces—not a robot or character. The worker, facility supervisor, staffing operations team, schedule system, time clock, and location evidence occupy believable connected rooms around a calm central decision workspace. Restrained signal-green pathways show the agent collecting missing facts, comparing sources, applying the customer rulebook, resolving routine cases, and routing one true exception to a human. The central system is represented by transparent evidence layers, a timeline, and a decision record with no legible text. The visual feeling is quiet coordination and trustworthy judgment.

**Copy:** One agent orchestrates the entire close.

**Camera dive:** Descend through the connected evidence pathways into the calm central decision workspace, gently orbit the converging sources, then continue toward the resolved output. End in a slow forward drift.

## Scene 05 — The settled shift

**Story:** Everyone can move because the shift reached an evidence-backed decision.

**Still subject:**

> A photorealistic connected outcome tableau with three believable spaces sharing one visual axis. The worker sees a confirmed pay-ready status on a phone with abstract, unreadable UI and a subtle expression of relief. The staffing agency finance team sees the same shift ready for customer billing with evidence attached. The operations lead focuses on one real exception while a large routine queue has cleared. At the center, the completed shift is represented as a restrained physical case file and evidence timeline joining all three outcomes. Natural human emotion, calm competence, normal adult proportions, no celebration cliché. Leave negative space on the left for the final statement.

**Copy:** One shift. Everyone can move.

**Camera dive:** Fly through the resolved evidence record, reveal the worker, agency, and operations outcomes along one continuous axis, then settle into a slow forward drift on the evidence-backed completed shift.

## Connector rule

For each connector, use the **actual last frame** of the previous rendered dive as `--start-image` and the **actual first frame** of the next rendered dive as `--end-image`. Never use the original Gemini still as a connector endpoint.

Connector movement should pull up only enough to reveal the next architectural space, travel through a plausible connected operations world, and descend toward the next real environment. Keep people and architecture realistic throughout; do not transform the world into toy islands.

## Set review gate

Do not start video generation until all five stills pass together:

- realistic and consistent human scale
- believable room size and spacing
- compatible camera height and lens language
- grounded enterprise photography, not concept-art spectacle
- signal green used sparingly and consistently
- worker, agency, and ops stories readable without generated text
- central focal subjects remain within the safe 16:9 center crop
- no image looks like a different campaign or rendering engine
