# Sound credits and licenses

All recorded material in the ONE SWEEP soundtrack comes from two public-domain (CC0 1.0) sample libraries; the broom's
grains are the VCSL ocean drum (beads on skin). Everything else (choir, beam, impacts' sub layers, wind, heartbeat, reverbs)
is synthesised from code in `audio/lib/`. No audio, melody or sample from the reference clip is used anywhere.

| Library | Author | License | Where the license file is | Used for |
|---|---|---|---|---|
| **VS Chamber Orchestra: Community Edition (VSCO-2-CE)** — github.com/sgossner/VSCO-2-CE | Sam Gossner, Simon Dalzell (Versilian Studios); sample cutting Elan Hickler / Soundemote | **CC0 1.0 Universal** (public domain dedication) | `audio/samples/vsco/LICENSE` | violin / viola / cello sections (sustain, tremolo, spiccato), solo contrabass, harp, horn, tenor trombone, tuba, trumpet, flute, oboe, bassoon, timpani hits + rolls, bass drum, gong, suspended / clash cymbals |
| **Versilian Community Sample Library (VCSL)** — github.com/sgossner/VCSL | Sam Gossner / Versilian Studios | **CC0 1.0 Universal** | `audio/samples/vcsl/LICENSE` | concert bass drum (hits, rolls), frame drums, mallet toms, second gong, tubular bells, bowed vibraphone, wine glasses, bowed / struck brake drums, anvil |

CC0 means no attribution is required and the samples may be used commercially; this file records the sources anyway.
Only the folders listed in `audio/tools/fetch_samples.py` were downloaded (about 1.5 GB of WAV files + the license and
readme files). Nothing from the downloads is executed: they are read as audio data only.
