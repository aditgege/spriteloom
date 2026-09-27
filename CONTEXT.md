# SpriteLoom — Context

Glossary-only. No implementation details.

- **Source**: An uploaded image being processed into frames.
- **Frame**: A single curated sprite cut from a Source.
- **Sheet**: The assembled export grid of all curated Frames.
- **Cell**: One grid slot in the Sheet holding a Frame.
- **Anchor**: The named alignment point shared by the Sheet.
- **Pitch**: The detected repeat spacing of the recovered pixel grid.
- **Pivot**: The per-Frame alignment point pinned to the Anchor.
- **Tray**: The reorderable strip holding curated Frames before export.
- **Palette**: The set of colors the snapped output is limited to.
- **Dither**: The ordered pattern that blends two colors without new ones.
- **Preset**: A named one-click bundle of sheet layout settings.
- **Clip**: A named ordered subset of Frames with per-frame timing (e.g., Idle 4f).
- **Stack**: The visual overlay order used to align Frames on the Anchor.
- **Align**: The workflow that polishes one Clip — anchor, offset, timing, stack, play.
