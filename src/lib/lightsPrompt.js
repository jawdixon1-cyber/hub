// Prompts for Christmas-lights mockups. Used by Hub's server (api/lights-mockup.js)
// and by the ChatGPT buttons on the Mockup panel.

const DESIGNS = {
  warm: 'warm white C9 LED bulbs — a clean, bright warm white like real-world C9 warm white, not too yellow',
  cool: 'cool white C9 LED bulbs — crisp, bright cool white with a slight blue tint',
  multi: 'classic multicolor C9 LED bulbs in a strict repeating order — red, green, blue, yellow, orange, then red again — never two of the same color next to each other',
  redwhite: 'C9 LED bulbs strictly alternating one red, one warm white (red, white, red, white…) — exactly 1-to-1, never two whites or two reds next to each other',
  redgreen: 'C9 LED bulbs strictly alternating one red, one green (red, green, red, green…) — exactly 1-to-1, never two of the same color next to each other',
};

export const NIGHT_PROMPT = `Edit this photo into a photorealistic dusk/nighttime exterior photograph of the same house.

Keep the house, rooflines, landscaping, vehicles, camera angle and composition exactly the same. Do not add, remove or change any architectural elements, landscaping or objects. Do NOT add any Christmas lights or decorations of any kind. Remove any on-screen overlays or text boxes (like a map or Street View label) by filling in the scene naturally.

Deep blue evening sky, natural low-light exposure, accurate shadows. Existing porch or wall lights and a few windows may be softly lit. It must look like a real photo taken at dusk.`;

export function buildPrompt(design, custom) {
  const lights = custom?.trim() ? `C9 LED bulbs in this color pattern: ${custom.trim()}` : (DESIGNS[design] || DESIGNS.warm);
  return `Edit this photo into a photorealistic nighttime exterior image of a professional Christmas light installation.

The bright magenta lines painted on the photo are installation guides. Install ${lights} exactly along every magenta line, following each line's full length and every corner, with bulbs evenly spaced about 12 inches apart and facing outward. Put lights ONLY where a magenta line is. Any roofline, gutter, eave, ridge, window, tree or bush without a magenta line on it must have zero lights — count the magenta lines and light exactly those, nothing more. Then remove every trace of the magenta lines; none of the magenta may remain in the final image.

Keep the house, rooflines, landscaping, vehicles, camera angle and composition exactly the same. Do not add, remove or change any architectural elements, landscaping or objects. Remove any on-screen overlays or text boxes (like a map or Street View label) by filling in the scene naturally.

Make it a realistic dusk/night scene: deep blue sky, natural exposure, accurate shadows, and the lights casting a soft glow on the house and the ground right around it. Existing porch or wall lights may be on.

The result must look like a real photograph of a professional holiday lighting installation, suitable for a customer mockup.`;
}

const lightsFor = (design, custom) => (custom?.trim() ? `C9 LED bulbs in this color pattern: ${custom.trim()}` : (DESIGNS[design] || DESIGNS.warm));

// Prompt for Jude's own ChatGPT: drag in every side's clean + lines photo and
// this prompt, send once, and it makes one image per side in a single reply.
//   sides: [{ n: 1, done: false, lines: 4 }, ...]
export function buildChatPrompt(design, custom, sides) {
  if (sides.length && sides.every((s) => s.done)) sides = sides.map((s) => ({ ...s, done: false }));
  const todo = sides.filter((s) => !s.done);
  const done = sides.filter((s) => s.done);
  const lineCount = (s) => (s?.lines ? `${s.lines} magenta line${s.lines > 1 ? 's' : ''}` : 'magenta lines');
  return `We're making a Christmas lights mockup of ONE house. I'm attaching every side at once. Each side has two photos:
- sideN-photo: the clean photo — this is the one you edit
- sideN-lines: the same photo, stamped "SIDE N", with magenta lines showing exactly where the lights go
${done.length ? `\nI'm also attaching ${done.map((s) => `side${s.n}-done`).join(' and ')} — a finished side. Match its look exactly.\n` : ''}
For each side, make ONE image with your image generator (never with code, Python or drawing tools — no pasted dots or color overlays): the clean photo turned into a photorealistic dusk/night photo of a professional Christmas light installation.

Lights: ${lightsFor(design, custom)}.

- Put bulbs exactly on every magenta line — follow each line's full length and every corner, about 12 inches apart, facing outward. Count the lines; each one must be lit, including any behind trees (bulbs glowing through the leaves).
- Light ONLY the magenta lines. Hips, ridges, other gutters, windows, trees, bushes, cars and anything else stay unlit. No magenta and no "SIDE N" stamp in the result.
- The color pattern must be perfectly regular on every line — check bulb by bulb so the order never breaks.
- Keep the house, roof, landscaping, vehicles, camera angle and framing exactly the same. Don't add, remove or change anything. Remove any on-screen overlays or text boxes (like a Street View label) naturally.
- Every side must look like the same night and the same install as the other sides: same bulbs, colors, spacing, brightness, sky and exposure. If a roofline lit on another side shows at the edge of this photo, light it to match.
- Deep blue evening sky, natural exposure, soft glow from the lights on the house and ground. It must look like a real photo good enough to show a customer.

Make exactly ${todo.length} image${todo.length > 1 ? 's' : ''} in THIS reply, in this order: ${todo.map((x) => `side ${x.n} (${lineCount(x)})`).join(', then ')}. Pair each sideN-photo with the sideN-lines that has the same number — some sides look alike, so go by the number. Make every side exactly once (never the same side twice) and don't stop or ask me anything until all ${todo.length} are done.`;
}

// Night "before" photo: same shot after dark, NO lights — the left side of the before/after slider.
export function buildNightPrompt() {
  return `Edit the uploaded house photo to show the exact same scene at night, about 30 minutes after sunset — with NO Christmas lights and no decorations of any kind.

Use the original photo as the exact reference and keep the house, rooflines, landscaping, camera angle, framing, and composition completely unchanged, so it lines up perfectly with a lit-up version of the same photo.

Make it dark and a little moody: deep blue night sky, the house mostly in shadow, just normal porch/garage lights on if the house has them. Realistic nighttime exposure — it should look like a real photo taken at night, not a filter.

Do not add, remove, or alter anything. Remove any on-screen overlays or text boxes (like a Street View label). Use your image generator, not code.`;
}

// "Show photo" prompt: Jude's original ChatGPT prompt, with the color filled in.
// These are just for the wow factor — no lines, no strict placement rules.
export function buildShowPrompt(design, custom, count, guides = false, bulbs = 0, extras = []) {
  const many = count > 1;
  const guideNote = guides
    ? `\n\nEach house photo (photo-sideN) comes with a matching lines photo (lines-sideN) — the same shot with our bulb map drawn on it. Use it as your guide for exactly where the lights go, and edit the clean photo-sideN.${bulbs ? `

BULB COUNT IS EXACT. In each lines photo, every run is drawn in its own color, with a short bar where the run starts and where it ends, and a dot for every single bulb (they're 12 inches apart). Each run is also labeled with its bulb count (e.g. "25 bulbs"). Put exactly one C9 bulb on each dot — no extra bulbs between dots and nothing past the end bars. That's ${bulbs} bulbs in total across the whole house; do not add more. Leave every roofline without dots dark. No dots, bars, colors, labels or numbers in the result — just the real lights.` : ''}`
    : '';
  return `Edit the uploaded house photo${many ? `s (${count} photos of the same house)` : ''} to create ${many ? 'photorealistic nighttime exterior images' : 'a photorealistic nighttime exterior image'} showing a professional Christmas light installation.${guideNote}

Use the original photo as the exact reference and keep the house, rooflines, landscaping, camera angle, and composition unchanged.

Install ${lightsFor(design, custom)} ${guides ? 'exactly on the dots in the lines photo (leave every other roofline dark)' : 'along all visible gutter lines, eaves, and gable edges'}, spacing the bulbs evenly about 12 inches apart and facing outward. Keep all ridge caps completely bare with no lights.${design === 'warm' && !custom?.trim() ? ' Use a clean, bright warm-white color temperature — not too yellow, matching real-world C9 warm white lights.' : ' Keep the color pattern perfectly regular — never break the order.'}

${extras.length ? `ALSO LIGHT THESE (marked with numbered green circles in the lines photo) with matching mini lights, wrapped neatly and evenly:\n${extras.join('\n')}\nOnly these — no other bushes, trees, columns or railings get lights. No green circles or numbers in the result.\n\n` : ''}Do not light any other trees or bushes — keep landscaping minimal and tasteful, leaving most bushes and trees unlit. No lights on cars.

Maintain realistic nighttime/dusk lighting, with natural exposure, accurate shadows, and the glow from the lights softly illuminating the house and immediate surroundings.

Do not add, remove, or alter any architectural elements, landscaping, or objects. Remove any on-screen overlays or text boxes (like a Street View label).

The result should look like a real photograph of a professional holiday lighting installation, suitable for a customer mockup.${many ? `

Make ${count} separate images — one for each house photo, each exactly once — all looking like the same night and the same install. Don't combine them into one image and don't add any text or labels.` : ''} Use your image generator, not code.`;
}
