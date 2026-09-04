import { Svg, Path } from 'react-native-svg';

import {
  ICON_PATHS,
  ICON_STROKE_WIDTH,
  ICON_VIEWBOX,
  type IconName,
} from '@/ui/icons';
import { type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type { IconName };

/**
 * One stroke glyph, drawn from `src/ui/icons.ts`.
 *
 * All the shape lives in that table and none of it lives here: this file scales the 24×24 box to
 * whatever size the caller asks for and paints it in one `ThemeColor`. That split is on purpose —
 * the table is pure data `verify` can hold, and a renderer that carried its own paths would put
 * half the glyphs back out of the gate's reach.
 *
 * The stroke scales with the glyph (`vectorEffect` is not set), because a 2pt stroke drawn at 16
 * is a heavier glyph than the same stroke at 24, and the artboards draw one weight at every size.
 */
export function Icon({
  name,
  size = 24,
  color = 'text',
}: {
  name: IconName;
  /** Both sides of the square. The artboards draw 16, 20 and 24; nothing here fixes that list. */
  size?: number;
  /** A role, never a hex — the same glyph is drawn in five different colours across the set. */
  color?: ThemeColor;
}) {
  const theme = useTheme();

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`} fill="none">
      {ICON_PATHS[name].map((d) => (
        <Path
          key={d}
          d={d}
          stroke={theme[color]}
          strokeWidth={ICON_STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}
