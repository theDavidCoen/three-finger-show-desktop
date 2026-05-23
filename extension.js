/* Three-finger swipe down → show desktop (additive; GNOME Shell 50, ESM) */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {actionMode} from 'resource:///org/gnome/shell/ui/main.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const FINGER_COUNT = 3;
const DRAG_THRESHOLD_PX = 16;
/** Finger motion toward the bottom of the touchpad (libinput / Mutter coords). */
const ACTIVATION_DOWN_PX = 100;

function isDesktopMode() {
    return (Shell.ActionMode.NORMAL & actionMode) !== 0 && !Main.overview.visible;
}

function getMinimizableWindows() {
    const workspace = global.workspace_manager.get_active_workspace();
    return global.get_window_actors()
        .filter(actor => actor.visible)
        .map(actor => actor.meta_window)
        .filter(win =>
            win &&
            win.get_window_type() !== Meta.WindowType.DESKTOP &&
            !win.minimized &&
            (win.is_always_on_all_workspaces() ||
                win.get_workspace() === workspace) &&
            win.can_minimize()
        );
}

/**
 * Observes 3-finger touchpad swipes without blocking GNOME (always PROPAGATE).
 * Activates only on a clearly downward, mostly-vertical gesture at END.
 */
const TouchpadSwipeDownObserver = GObject.registerClass(
    class TouchpadSwipeDownObserver extends GObject.Object {
        constructor() {
            super();
            this._tracking = false;
            this._cumulativeX = 0;
            this._cumulativeY = 0;
            this._showingDesktop = false;
            this._savedWindows = [];

            this._stageHandler = global.stage.connect(
                'captured-event::touchpad',
                this._onEvent.bind(this),
            );
        }

        destroy() {
            if (this._stageHandler) {
                global.stage.disconnect(this._stageHandler);
                this._stageHandler = 0;
            }
        }

        _resetTracking() {
            this._tracking = false;
            this._cumulativeX = 0;
            this._cumulativeY = 0;
        }

        /**
         * Physical swipe from top to bottom on the touchpad.
         * Direction uses raw Mutter deltas (not natural-scroll UI setting).
         */
        _isDownwardSwipe(cdx, cdy) {
            if (cdy < ACTIVATION_DOWN_PX)
                return false;
            if (Math.abs(cdy) <= Math.abs(cdx))
                return false;
            return true;
        }

        _onEvent(_actor, event) {
            // Never stop propagation — stock 3-finger up → overview must keep working.
            if (event.type() !== Clutter.EventType.TOUCHPAD_SWIPE)
                return Clutter.EVENT_PROPAGATE;

            const phase = event.get_gesture_phase();
            const fingers = event.get_touchpad_gesture_finger_count();

            if (phase === Clutter.TouchpadGesturePhase.BEGIN) {
                this._resetTracking();
                if (fingers === FINGER_COUNT && isDesktopMode())
                    this._tracking = true;
                return Clutter.EVENT_PROPAGATE;
            }

            if (!this._tracking)
                return Clutter.EVENT_PROPAGATE;

            if (fingers !== FINGER_COUNT) {
                this._resetTracking();
                return Clutter.EVENT_PROPAGATE;
            }

            if (!isDesktopMode()) {
                this._resetTracking();
                return Clutter.EVENT_PROPAGATE;
            }

            const [dx, dy] = event.get_gesture_motion_delta_unaccelerated();
            this._cumulativeX += dx;
            this._cumulativeY += dy;

            // Upward or horizontal-dominant → abandon; let GNOME handle overview etc.
            if (this._cumulativeY < -DRAG_THRESHOLD_PX) {
                this._resetTracking();
                return Clutter.EVENT_PROPAGATE;
            }

            if (
                phase === Clutter.TouchpadGesturePhase.END &&
                this._isDownwardSwipe(this._cumulativeX, this._cumulativeY)
            )
                this._toggleShowDesktop();

            if (
                phase === Clutter.TouchpadGesturePhase.END ||
                phase === Clutter.TouchpadGesturePhase.CANCEL
            )
                this._resetTracking();

            return Clutter.EVENT_PROPAGATE;
        }

        _toggleShowDesktop() {
            if (this._showingDesktop) {
                this._restoreWindows();
                return;
            }

            const windows = getMinimizableWindows();
            if (windows.length === 0)
                return;

            this._savedWindows = windows;
            for (const win of windows) {
                const actor = win.get_compositor_private();
                if (actor)
                    Main.wm.skipNextEffect(actor);
                win.minimize();
            }
            this._showingDesktop = true;
        }

        _restoreWindows() {
            for (const win of this._savedWindows) {
                if (!win || win.get_window_type() === Meta.WindowType.DESKTOP)
                    continue;
                const actor = win.get_compositor_private();
                if (actor)
                    Main.wm.skipNextEffect(actor);
                if (win.minimized)
                    win.unminimize();
            }
            this._savedWindows = [];
            this._showingDesktop = false;
        }

        /** Undo show-desktop state when the extension is disabled. */
        resetShowDesktop() {
            if (this._showingDesktop)
                this._restoreWindows();
            this._resetTracking();
        }
    },
);

export default class ThreeFingerShowDesktopExtension extends Extension {
    enable() {
        this._gesture = new TouchpadSwipeDownObserver();
    }

    disable() {
        this._gesture?.resetShowDesktop();
        this._gesture?.destroy();
        this._gesture = null;
    }
}
