/* Three-finger swipe down → show desktop with live preview (GNOME Shell 50, ESM) */

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {actionMode} from 'resource:///org/gnome/shell/ui/main.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {SwipeTracker} from 'resource:///org/gnome/shell/ui/swipeTracker.js';
import {lerp} from 'resource:///org/gnome/shell/misc/util.js';
import {MonitorConstraint} from 'resource:///org/gnome/shell/ui/layout.js';

const FINGER_COUNT = 3;
const DRAG_THRESHOLD_PX = 16;
const ACTIVATION_DOWN_PX = 80;
const CANCEL_PROGRESS = 0.15;
const MIN_FINISH_DURATION_MS = 120;
const END_SCALE = 0.2;
const SWIPE_MULTIPLIER = 1;

const DesktopState = {
    NORMAL: 0,
    SHOW_DESKTOP: 1,
};

const TouchpadState = {
    NONE: 0,
    PENDING: 1,
    HANDLING: 2,
    IGNORED: 3,
};

function isDesktopMode() {
    return (Shell.ActionMode.NORMAL & actionMode) !== 0 && !Main.overview.visible;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function primarySwipeDistance() {
    const m = Main.layoutManager.primaryMonitor;
    return m?.height ?? 900;
}

function progressToUnit(progress) {
    return clamp(progress, 0, 1);
}

/**
 * Vertical touchpad swipe — only finger motion toward the bottom of the pad.
 */
const TouchpadSwipeDownOnly = GObject.registerClass(
    {
        Signals: {
            begin: {
                param_types: [
                    GObject.TYPE_UINT,
                    GObject.TYPE_DOUBLE,
                    GObject.TYPE_DOUBLE,
                ],
            },
            update: {
                param_types: [
                    GObject.TYPE_UINT,
                    GObject.TYPE_DOUBLE,
                    GObject.TYPE_DOUBLE,
                ],
            },
            end: {param_types: [GObject.TYPE_UINT, GObject.TYPE_DOUBLE]},
        },
    },
    class TouchpadSwipeDownOnly extends GObject.Object {
        constructor(allowedModes) {
            super();
            this._nfingers = [FINGER_COUNT];
            this._allowedModes = allowedModes;
            this._swipeDistance = primarySwipeDistance();
            this._state = TouchpadState.NONE;
            this.enabled = true;

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

        setSwipeDistance(distance) {
            this._swipeDistance = Math.max(distance, 200);
        }

        _reset() {
            this._state = TouchpadState.NONE;
            this._cumulativeX = 0;
            this._cumulativeY = 0;
        }

        _motionDelta(dy) {
            // Signed delta: down on pad increases progress, reversing up decreases it.
            return dy * SWIPE_MULTIPLIER;
        }

        _onEvent(_actor, event) {
            if (event.type() !== Clutter.EventType.TOUCHPAD_SWIPE)
                return Clutter.EVENT_PROPAGATE;

            const phase = event.get_gesture_phase();

            if (phase === Clutter.TouchpadGesturePhase.BEGIN)
                this._reset();

            if (this._state === TouchpadState.IGNORED)
                return Clutter.EVENT_PROPAGATE;

            if (!this.enabled)
                return Clutter.EVENT_PROPAGATE;

            if (
                this._allowedModes !== Shell.ActionMode.ALL &&
                (this._allowedModes & actionMode) === 0
            ) {
                this._state = TouchpadState.IGNORED;
                return Clutter.EVENT_PROPAGATE;
            }

            if (!this._nfingers.includes(event.get_touchpad_gesture_finger_count())) {
                this._state = TouchpadState.IGNORED;
                return Clutter.EVENT_PROPAGATE;
            }

            const time = event.get_time();
            const [x, y] = event.get_coords();
            const [, dy] = event.get_gesture_motion_delta_unaccelerated();

            if (this._state === TouchpadState.NONE) {
                if (dy === 0 && event.get_gesture_motion_delta_unaccelerated()[0] === 0)
                    return Clutter.EVENT_PROPAGATE;
                this._cumulativeX = 0;
                this._cumulativeY = 0;
                this._state = TouchpadState.PENDING;
            }

            if (this._state === TouchpadState.PENDING) {
                const [dx] = event.get_gesture_motion_delta_unaccelerated();
                this._cumulativeX += dx;
                this._cumulativeY += dy;
                const cdx = this._cumulativeX;
                const cdy = this._cumulativeY;

                if (Math.hypot(cdx, cdy) < DRAG_THRESHOLD_PX)
                    return Clutter.EVENT_PROPAGATE;

                if (Math.abs(cdy) <= Math.abs(cdx)) {
                    this._state = TouchpadState.IGNORED;
                    return Clutter.EVENT_PROPAGATE;
                }

                // Start only on downward intent; upward-only swipes go to Overview.
                if (cdy <= 0) {
                    this._state = TouchpadState.IGNORED;
                    return Clutter.EVENT_PROPAGATE;
                }

                this._cumulativeX = 0;
                this._cumulativeY = 0;
                this._state = TouchpadState.HANDLING;
                this.emit('begin', time, x, y);
            }

            if (this._state !== TouchpadState.HANDLING)
                return Clutter.EVENT_PROPAGATE;

            const distance = this._swipeDistance;

            if (
                phase === Clutter.TouchpadGesturePhase.UPDATE ||
                phase === Clutter.TouchpadGesturePhase.BEGIN
            ) {
                this.emit('update', time, this._motionDelta(dy), distance);
                return Clutter.EVENT_STOP;
            }

            if (
                phase === Clutter.TouchpadGesturePhase.END ||
                phase === Clutter.TouchpadGesturePhase.CANCEL
            ) {
                this.emit('end', time, distance);
                this._reset();
                return Clutter.EVENT_STOP;
            }

            return Clutter.EVENT_STOP;
        }
    },
);

function createDownSwipeTracker(allowedModes) {
    const swipeTracker = new SwipeTracker(
        global.stage,
        Clutter.Orientation.VERTICAL,
        allowedModes,
        {allowDrag: false, allowScroll: false, phase: Clutter.EventPhase.CAPTURE},
    );

    swipeTracker.allowLongSwipes = false;

    if (swipeTracker._touchpadGesture)
        swipeTracker._touchpadGesture.destroy();

    const touchpad = new TouchpadSwipeDownOnly(allowedModes);
    swipeTracker._touchpadGesture = touchpad;

    touchpad.connect('begin', swipeTracker._beginTouchpadGesture.bind(swipeTracker));
    touchpad.connect('update', swipeTracker._updateTouchpadGesture.bind(swipeTracker));
    touchpad.connect('end', swipeTracker._endTouchpadGesture.bind(swipeTracker));
    swipeTracker.bind_property(
        'enabled',
        touchpad,
        'enabled',
        GObject.BindingFlags.SYNC_CREATE,
    );

    return swipeTracker;
}

/**
 * Scales and slides window clones toward the bottom (overview-like motion).
 */
class MonitorGroup {
    constructor(monitor) {
        this.monitor = monitor;
        this._container = new Clutter.Actor({visible: false});
        this._container.add_constraint(new MonitorConstraint({index: monitor.index}));
        this._container.set_clip_to_allocation(true);
        Main.layoutManager.uiGroup.insert_child_above(
            this._container,
            global.window_group,
        );
        this._entries = [];
        this._finishing = 0;
    }

    destroy() {
        this.abort();
        if (this._container) {
            this._container.destroy();
            this._container = null;
        }
    }

    _layoutEntry(entry) {
        const {clone} = entry;
        entry.baseW = clone.width;
        entry.baseH = clone.height;
        entry.startX = clone.x;
        entry.startY = clone.y;
        entry.endX = (this.monitor.width - entry.baseW * END_SCALE) / 2;
        entry.endY = this.monitor.height - entry.baseH * END_SCALE - 8;
        entry.startScale = 1;
        entry.endScale = END_SCALE;
    }

    begin(windowActors) {
        this.abort();

        for (const windowActor of windowActors) {
            const clone = new Clutter.Clone({
                source: windowActor,
                x: windowActor.x - this.monitor.x,
                y: windowActor.y - this.monitor.y,
            });
            clone.set_pivot_point(0, 0);
            windowActor.hide();
            const entry = {clone, windowActor};
            this._layoutEntry(entry);
            this._entries.push(entry);
            this._container.insert_child_below(clone, null);
        }

        if (this._entries.length > 0)
            this._container.show();
    }

    _applyProgress(progress) {
        const p = progressToUnit(progress);

        for (const entry of this._entries) {
            const {clone, startX, startY, endX, endY, startScale, endScale} = entry;
            clone.remove_all_transitions();
            const scale = lerp(startScale, endScale, p);
            clone.set_pivot_point(0, 0);
            clone.set_scale(scale, scale);
            clone.x = lerp(startX, endX, p);
            clone.y = lerp(startY, endY, p);
            clone.opacity = Math.round(lerp(255, 200, p));
        }
    }

    update(progress) {
        if (this._finishing > 0)
            return;
        this._applyProgress(progress);
    }

    _applyWindowState(windowActor, desktopState) {
        const win = windowActor.meta_window;
        if (!win?.can_minimize()) {
            windowActor.show();
            return;
        }
        Main.wm.skipNextEffect(windowActor);
        if (desktopState === DesktopState.NORMAL) {
            win.unminimize();
            windowActor.show();
        } else {
            win.minimize();
            windowActor.hide();
        }
    }

    _finishEntry(entry, progress, duration, onDone) {
        const {clone, windowActor} = entry;
        const p = progressToUnit(progress);
        const targetX = lerp(entry.startX, entry.endX, p);
        const targetY = lerp(entry.startY, entry.endY, p);
        const targetScale = lerp(entry.startScale, entry.endScale, p);
        const targetOpacity = Math.round(lerp(255, 200, p));

        clone.remove_all_transitions();

        const finalize = () => {
            this._applyWindowState(windowActor, progress);
            clone.destroy();
            this._finishing -= 1;
            onDone();
        };

        const dur = Math.max(duration, MIN_FINISH_DURATION_MS);
        if (dur <= 0) {
            clone.x = targetX;
            clone.y = targetY;
            clone.set_scale(targetScale, targetScale);
            clone.opacity = targetOpacity;
            finalize();
            return;
        }

        this._finishing += 1;
        clone.ease({
            x: targetX,
            y: targetY,
            scale_x: targetScale,
            scale_y: targetScale,
            opacity: targetOpacity,
            duration: dur,
            mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
            onStopped: finalize,
        });
    }

    end(progress, duration) {
        if (this._entries.length === 0) {
            this._container.hide();
            return;
        }

        const entries = this._entries;
        this._entries = [];
        let remaining = entries.length;

        const done = () => {
            remaining -= 1;
            if (remaining === 0)
                this._container.hide();
        };

        for (const entry of entries)
            this._finishEntry(entry, progress, duration, done);
    }

    abort() {
        for (const {clone, windowActor} of this._entries) {
            clone.remove_all_transitions();
            clone.destroy();
            windowActor.show();
        }
        this._entries = [];
        this._finishing = 0;
        this._container.hide();
    }
}

class ShowDesktopGesture {
    constructor() {
        this._showingDesktop = false;
        this._minimizingWindows = [];
        this._monitorGroups = [];
        this._gestureActive = false;
        this._restoreSwipeDown = 0;
        this._restoreHandlers = [];
        this._swipeDistance = primarySwipeDistance();

        this._swipeTracker = createDownSwipeTracker(Shell.ActionMode.NORMAL);
        this._touchpad = this._swipeTracker._touchpadGesture;

        this._handlers = [
            this._swipeTracker.connect('begin', this._onSwipeBegin.bind(this)),
            this._swipeTracker.connect('update', this._onSwipeUpdate.bind(this)),
            this._swipeTracker.connect('end', this._onSwipeEnd.bind(this)),
        ];

        for (const monitor of Main.layoutManager.monitors)
            this._monitorGroups.push(new MonitorGroup(monitor));

        this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => {
            this._rebuildMonitorGroups();
        });

        this._overviewShowingId = Main.overview.connect('showing', () => {
            this._leaveShowDesktop();
        });
        this._overviewHiddenId = Main.overview.connect('hidden', () => {
            if (this._gestureActive)
                this._cancelActiveGesture(true);
        });

        this._restoreHandlers = [
            this._touchpad.connect('begin', () => {
                if (this._showingDesktop && !this._gestureActive)
                    this._restoreSwipeDown = 0;
            }),
            this._touchpad.connect('update', (_t, _time, dy, _dist) => {
                if (!this._showingDesktop || this._gestureActive)
                    return;
                this._restoreSwipeDown += dy > 0 ? dy : 0;
            }),
            this._touchpad.connect('end', this._onTouchpadEndForRestore.bind(this)),
        ];
    }

    _rebuildMonitorGroups() {
        if (this._gestureActive)
            this._cancelActiveGesture(false);
        for (const g of this._monitorGroups)
            g.destroy();
        this._monitorGroups = [];
        for (const monitor of Main.layoutManager.monitors)
            this._monitorGroups.push(new MonitorGroup(monitor));
    }

    destroy() {
        this.resetShowDesktop();
        for (const id of this._restoreHandlers)
            this._touchpad.disconnect(id);
        this._restoreHandlers = [];
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = 0;
        }
        if (this._overviewShowingId) {
            Main.overview.disconnect(this._overviewShowingId);
            this._overviewShowingId = 0;
        }
        if (this._overviewHiddenId) {
            Main.overview.disconnect(this._overviewHiddenId);
            this._overviewHiddenId = 0;
        }
        for (const id of this._handlers)
            this._swipeTracker.disconnect(id);
        this._handlers = [];
        this._swipeTracker.destroy();
        for (const g of this._monitorGroups)
            g.destroy();
        this._monitorGroups = [];
    }

    _collectWindows() {
        const workspace = global.workspace_manager.get_active_workspace();
        return global.get_window_actors()
            .filter(a => a.visible)
            .map(a => a.meta_window)
            .filter(win =>
                win &&
                win.get_window_type() !== Meta.WindowType.DESKTOP &&
                !win.minimized &&
                (win.is_always_on_all_workspaces() ||
                    win.get_workspace() === workspace) &&
                win.can_minimize(),
            );
    }

    _cancelActiveGesture(animate) {
        if (!this._gestureActive)
            return;

        this._gestureActive = false;
        if (animate) {
            for (const group of this._monitorGroups)
                group.end(DesktopState.NORMAL, MIN_FINISH_DURATION_MS);
        } else {
            for (const group of this._monitorGroups)
                group.abort();
        }
        this._minimizingWindows = [];
    }

    _onTouchpadEndForRestore() {
        if (!this._showingDesktop || this._gestureActive)
            return;
        if (this._restoreSwipeDown >= ACTIVATION_DOWN_PX)
            this._restoreAll();
        this._restoreSwipeDown = 0;
    }

    _onSwipeBegin(tracker, _monitor) {
        if (!isDesktopMode() || this._showingDesktop) {
            this._gestureActive = false;
            return;
        }

        this._minimizingWindows = this._collectWindows();
        if (this._minimizingWindows.length === 0) {
            this._gestureActive = false;
            return;
        }

        this._swipeDistance = primarySwipeDistance();
        this._touchpad.setSwipeDistance(this._swipeDistance);

        tracker.confirmSwipe(
            this._swipeDistance,
            [DesktopState.NORMAL, DesktopState.SHOW_DESKTOP],
            DesktopState.NORMAL,
            CANCEL_PROGRESS,
        );

        let any = false;
        for (const group of this._monitorGroups) {
            const actors = this._minimizingWindows
                .map(w => w.get_compositor_private())
                .filter(a =>
                    a instanceof Meta.WindowActor &&
                    a.meta_window?.get_monitor() === group.monitor.index,
                );
            if (actors.length > 0) {
                group.begin(actors);
                any = true;
            }
        }

        if (!any) {
            this._gestureActive = false;
            this._minimizingWindows = [];
            return;
        }

        this._gestureActive = true;
    }

    _onSwipeUpdate(_tracker, progress) {
        if (!this._gestureActive)
            return;
        const p = progressToUnit(progress);
        for (const group of this._monitorGroups)
            group.update(p);
    }

    _onSwipeEnd(_tracker, duration, endProgress) {
        if (!this._gestureActive) {
            this._restoreSwipeDown = 0;
            return;
        }

        this._gestureActive = false;
        const target =
            endProgress >= 0.5 ? DesktopState.SHOW_DESKTOP : DesktopState.NORMAL;

        for (const group of this._monitorGroups)
            group.end(target, duration);

        if (target === DesktopState.SHOW_DESKTOP)
            this._showingDesktop = true;
        else
            this._minimizingWindows = [];
    }

    _restoreWindow(win) {
        if (!win || win.get_window_type() === Meta.WindowType.DESKTOP)
            return;

        const actor = win.get_compositor_private();
        if (actor) {
            Main.wm.skipNextEffect(actor);
            actor.show();
        }
        if (win.minimized)
            win.unminimize();
    }

    _restoreAll() {
        for (const win of this._minimizingWindows)
            this._restoreWindow(win);
        this._minimizingWindows = [];
        this._showingDesktop = false;
    }

    _leaveShowDesktop() {
        this._cancelActiveGesture(true);
        if (this._showingDesktop)
            this._restoreAll();
    }

    resetShowDesktop() {
        this._leaveShowDesktop();
        this._minimizingWindows = [];
    }
}

export default class ThreeFingerShowDesktopExtension extends Extension {
    enable() {
        this._gesture = new ShowDesktopGesture();
    }

    disable() {
        this._gesture?.resetShowDesktop();
        this._gesture?.destroy();
        this._gesture = null;
    }
}
