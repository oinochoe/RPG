// Geometry of the phone HUD (TouchHud.tsx), shared with everything that has to stay clear of it: the
// draggable panels (they open below/next to it, never on top of its buttons) and the buff icons.

/** Side of one panel-toggle button. 44px is the minimum comfortable touch target. */
export const TOUCH_BUTTON_SIZE = 44;
export const TOUCH_BUTTON_GAP = 4;
/** The top-left column is as wide as the row of five panel buttons. */
export const TOUCH_STATUS_WIDTH = 5 * TOUCH_BUTTON_SIZE + 4 * TOUCH_BUTTON_GAP;

/** Portrait: y below which a panel/sheet may start (the status card + the button row sit above it). */
export const TOUCH_TOP_INSET = 168;
/** Landscape: x from which a panel may start (the status column sits to its left). */
export const TOUCH_LEFT_COLUMN = TOUCH_STATUS_WIDTH + 12 + 12;
